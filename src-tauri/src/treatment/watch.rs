//! exe と同じ階層の `ris/rt_order` を見張り、置かれた治療依頼の Excel・CSV を自動で取り込む。
//!
//! 1. 一定の間隔でフォルダを調べ、Excel（xlsx・xlsm・xls）と CSV を探す。
//!    Excel が開いている間にできる `~$` で始まるファイルや、置かれた直後
//!    （書き込み中かもしれない）のファイルは見送る。
//! 2. ファイルをまず `取込中` へ移す。Excel で開いたままなどで移せないときは、次の回に回す。
//! 3. 画面からの取り込みと同じ [`super::import::apply`] で登録する。
//!    すでに登録済みの依頼は飛ばすので、同じファイルをもう一度置いても重複しない。
//! 4. すべての行を取り込めたら `取込済`、失敗した行があるかファイルを読めなければ
//!    `エラー` へ、取り込み結果（`.log.txt`）と一緒に移す。
//!
//! アプリが `取込中` に残したまま終了したファイルは、次の起動時に元の場所へ戻して取り込み直す。

use super::import::ImportRow;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const PROCESSING_DIR: &str = "取込中";
pub const DONE_DIR: &str = "取込済";
pub const ERROR_DIR: &str = "エラー";

const INTERVAL: Duration = Duration::from_secs(10);
/// 更新からこの時間がたつまでは、コピー中かもしれないので取り込まない。
const SETTLE: Duration = Duration::from_secs(3);

const EXTENSIONS: [&str; 4] = ["xlsx", "xlsm", "xls", "csv"];

/// 見張りのスレッドを立ち上げる。
pub fn spawn(dir: PathBuf) {
    if let Err(error) = fs::create_dir_all(&dir) {
        log::warn!("{} を作れませんでした: {error}", dir.display());
    }
    log::info!("治療依頼の自動取り込みフォルダ: {}", dir.display());
    restore_processing(&dir);
    let started = std::thread::Builder::new()
        .name("rt-order-watch".into())
        .spawn(move || loop {
            scan(&dir, SystemTime::now(), &super::import::apply);
            std::thread::sleep(INTERVAL);
        });
    if let Err(error) = started {
        log::warn!("治療依頼の自動取り込みを開始できませんでした: {error}");
    }
}

/// `取込中` に残ったファイルを元の場所へ戻す。
pub fn restore_processing(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir.join(PROCESSING_DIR)) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name() else {
            continue;
        };
        let back = unique_path(&dir.join(name));
        if let Err(error) = fs::rename(&path, &back) {
            log::warn!("{} を戻せませんでした: {error}", path.display());
        }
    }
}

/// 取り込んだファイルごとの結果。
#[derive(Debug, PartialEq, Eq)]
pub struct Outcome {
    pub moved_to: PathBuf,
    pub ok: bool,
}

/// フォルダを 1 回調べ、取り込めるファイルをすべて取り込む。
pub fn scan<F>(dir: &Path, now: SystemTime, importer: &F) -> Vec<Outcome>
where
    F: Fn(&[u8]) -> Result<Vec<ImportRow>, String>,
{
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut targets: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_target(path, now))
        .collect();
    targets.sort();
    targets
        .into_iter()
        .filter_map(|path| process(dir, &path, importer))
        .collect()
}

fn is_target(path: &Path, now: SystemTime) -> bool {
    let Ok(meta) = fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    // Excel が開いている間の一時ファイル（~$）や隠しファイルは見ない。
    if name.starts_with("~$") || name.starts_with('.') {
        return false;
    }
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return false;
    }
    match meta.modified() {
        Ok(modified) => now
            .duration_since(modified)
            .map(|age| age >= SETTLE)
            .unwrap_or(false),
        Err(_) => true,
    }
}

fn process<F>(dir: &Path, path: &Path, importer: &F) -> Option<Outcome>
where
    F: Fn(&[u8]) -> Result<Vec<ImportRow>, String>,
{
    let name = path.file_name()?.to_os_string();
    let processing_dir = dir.join(PROCESSING_DIR);
    if let Err(error) = fs::create_dir_all(&processing_dir) {
        log::warn!("{} を作れませんでした: {error}", processing_dir.display());
        return None;
    }
    let processing = unique_path(&processing_dir.join(&name));
    // 開いたまま（ロック中）のファイルは移せないので、次の回に回す。
    if fs::rename(path, &processing).is_err() {
        return None;
    }
    let result = fs::read(&processing)
        .map_err(|error| format!("ファイルを読めません: {error}"))
        .and_then(|bytes| importer(&bytes));

    let ok = matches!(&result, Ok(rows) if rows.iter().all(|row| row.status != "error"));
    let dest_dir = dir.join(if ok { DONE_DIR } else { ERROR_DIR });
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let file_name = format!("{stamp}_{}", name.to_string_lossy());
    let moved_to = fs::create_dir_all(&dest_dir)
        .and_then(|_| {
            let dest = unique_path(&dest_dir.join(&file_name));
            fs::rename(&processing, &dest).map(|_| dest)
        })
        .unwrap_or_else(|error| {
            log::warn!("{} を移せませんでした: {error}", processing.display());
            processing.clone()
        });

    let report = report(&name.to_string_lossy(), &result);
    let mut log_path = moved_to.clone().into_os_string();
    log_path.push(".log.txt");
    if let Err(error) = write_report(Path::new(&log_path), &report) {
        log::warn!("取り込み結果を書き出せませんでした: {error}");
    }
    log::info!(
        "治療依頼を自動で取り込みました: {}\n{report}",
        name.to_string_lossy()
    );
    Some(Outcome { moved_to, ok })
}

pub fn write_report(path: &Path, report: &str) -> std::io::Result<()> {
    let mut file = fs::File::create(path)?;
    // メモ帳などで文字化けしないよう BOM を付ける。
    file.write_all(b"\xEF\xBB\xBF")?;
    file.write_all(report.replace('\n', "\r\n").as_bytes())
}

fn report(name: &str, result: &Result<Vec<ImportRow>, String>) -> String {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let mut out = format!("ファイル: {name}\n取り込み日時: {now}\n");
    match result {
        Err(message) => {
            out.push_str(&format!("結果: 取り込めませんでした\n理由: {message}\n"));
        }
        Ok(rows) => {
            let count = |status: &str| rows.iter().filter(|row| row.status == status).count();
            out.push_str(&format!(
                "結果: 新規登録 {} 件・依頼のみ {} 件・取り込み済み {} 件・失敗 {} 件\n\n",
                count("create"),
                count("attach"),
                count("skip"),
                count("error"),
            ));
            for row in rows {
                let label = match row.status.as_str() {
                    "create" => "新規登録",
                    "attach" => "依頼のみ",
                    "skip" => "取り込み済み",
                    _ => "失敗",
                };
                let id = if row.patient_id.is_empty() {
                    "-"
                } else {
                    row.patient_id.as_str()
                };
                let when = if row.request_date.is_empty() {
                    String::new()
                } else {
                    format!(" {} {}", row.request_date, row.slot_time)
                };
                out.push_str(&format!(
                    "{} 行目\t{label}\t患者ID {id}{when}\t{}\n",
                    row.line, row.message
                ));
            }
        }
    }
    out
}

/// 同じ名前のファイルがあれば、`名前-2.拡張子` のように番号を付ける。
pub fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .unwrap_or_default();
    let parent = path.parent().unwrap_or(Path::new(""));
    (2..)
        .map(|n| parent.join(format!("{stem}-{n}{ext}")))
        .find(|candidate| !candidate.exists())
        .expect("空いている名前が見つかりません")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("rct_rt_order_watch_{label}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn later() -> SystemTime {
        SystemTime::now() + Duration::from_secs(60)
    }

    fn row(status: &str) -> ImportRow {
        ImportRow {
            line: 6,
            patient_id: "0000000001".into(),
            last_name_kanji: String::new(),
            first_name_kanji: String::new(),
            last_name_kana: String::new(),
            first_name_kana: String::new(),
            gender: String::new(),
            birth_date: String::new(),
            height: None,
            weight: None,
            request_date: "2026-12-02".into(),
            source_time: "14:30".into(),
            slot_time: "14:30".into(),
            requesting_department: String::new(),
            requesting_physician: String::new(),
            status: status.into(),
            message: "テスト".into(),
        }
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    #[test]
    fn moves_imported_files_and_leaves_others() {
        let dir = temp_dir("moves");
        fs::write(dir.join("a.xlsx"), b"ok").unwrap();
        fs::write(dir.join("b.CSV"), b"bad").unwrap();
        fs::write(dir.join("~$a.xlsx"), b"lock").unwrap();
        fs::write(dir.join("memo.txt"), b"memo").unwrap();

        let outcomes = scan(&dir, later(), &|bytes: &[u8]| {
            if bytes == b"ok" {
                Ok(vec![row("create")])
            } else {
                Err("治療依頼の Excel ではありません".into())
            }
        });
        assert_eq!(outcomes.len(), 2);

        assert_eq!(names(&dir.join(PROCESSING_DIR)), Vec::<String>::new());
        let done = names(&dir.join(DONE_DIR));
        assert_eq!(done.len(), 2);
        assert!(done[0].ends_with("_a.xlsx"));
        assert!(done[1].ends_with("_a.xlsx.log.txt"));
        let errors = names(&dir.join(ERROR_DIR));
        assert!(errors[0].ends_with("_b.CSV"));
        let log = fs::read_to_string(dir.join(ERROR_DIR).join(&errors[1])).unwrap();
        assert!(log.contains("治療依頼の Excel ではありません"));

        // ~$ と対象外の拡張子は残す
        assert!(dir.join("~$a.xlsx").exists());
        assert!(dir.join("memo.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_failed_row_sends_the_file_to_the_error_folder() {
        let dir = temp_dir("row_error");
        fs::write(dir.join("a.xlsx"), b"x").unwrap();
        let outcomes = scan(&dir, later(), &|_: &[u8]| {
            Ok(vec![row("create"), row("error")])
        });
        assert!(!outcomes[0].ok);
        assert!(outcomes[0].moved_to.starts_with(dir.join(ERROR_DIR)));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn waits_for_a_file_that_was_just_written() {
        let dir = temp_dir("settle");
        fs::write(dir.join("a.xlsx"), b"x").unwrap();
        let outcomes = scan(&dir, SystemTime::now(), &|_: &[u8]| Ok(vec![]));
        assert!(outcomes.is_empty());
        assert!(dir.join("a.xlsx").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn restores_files_left_in_processing() {
        let dir = temp_dir("restore");
        fs::create_dir_all(dir.join(PROCESSING_DIR)).unwrap();
        fs::write(dir.join(PROCESSING_DIR).join("a.xlsx"), b"x").unwrap();
        fs::write(dir.join("a.xlsx"), b"y").unwrap();
        restore_processing(&dir);
        assert_eq!(names(&dir), vec!["a-2.xlsx", "a.xlsx", PROCESSING_DIR]);
        let _ = fs::remove_dir_all(&dir);
    }
}
