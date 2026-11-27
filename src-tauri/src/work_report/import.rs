//! 作業報告書の取り込み（画面から選んだファイルと、フォルダに置いたファイル）。
//!
//! - PDF: Varian（Siemens Healthineers）の様式なら、文字を読み取って登録する。元の PDF も添付する。
//! - JSON: スマホで撮った報告書を Claude で読み取ったもの。同じ名前で始まる写真を一緒に置くと添付する
//!   （例: `報告書1.json` と `報告書1.jpg`・`報告書1-2.jpg`）。
//!
//! exe と同じ階層の `import/work_report` に置いたファイルは自動で取り込み、
//! 治療依頼の自動取り込みと同じように `取込済`・`エラー` へ取り込み結果と一緒に移す。

use super::model::{self, ImportResult, NewFile, ParsedReport, StaffCandidate};
use crate::treatment::watch::{unique_path, write_report, DONE_DIR, ERROR_DIR, PROCESSING_DIR};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const INTERVAL: Duration = Duration::from_secs(10);
const SETTLE: Duration = Duration::from_secs(3);
const IMAGE_EXTENSIONS: [&str; 6] = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
/// フォルダから取り込んだときの「更新した人」
const WATCH_ACTOR: &str = "自動取り込み";

/// 担当者一覧（担当技師の候補）を読む。
pub fn staff_candidates() -> Result<Vec<StaffCandidate>, String> {
    Ok(crate::auth::list_users()?
        .into_iter()
        .map(|user| StaffCandidate {
            id: user.id as i64,
            last_name: user.last_name,
            first_name: user.first_name,
        })
        .collect())
}

fn extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default()
}

/// ファイルの中身から報告書を読み取る。
pub fn parse(name: &str, bytes: &[u8]) -> Result<(ParsedReport, &'static str), String> {
    if bytes.starts_with(b"%PDF") {
        return super::pdf::parse_pdf(bytes).map(|parsed| (parsed, "pdf"));
    }
    if extension(name) == "json" || bytes.trim_ascii_start().starts_with(b"{") {
        let text = String::from_utf8_lossy(bytes);
        let text = text.trim_start_matches('\u{feff}');
        let parsed: ParsedReport = serde_json::from_str(text)
            .map_err(|error| format!("JSON を読めませんでした: {error}"))?;
        return Ok((parsed, "json"));
    }
    Err("PDF か JSON のファイルを選んでください".into())
}

/// 1 件分のファイル（先頭が報告書、残りは添付する写真）を取り込む。
pub fn import_files(files: Vec<NewFile>, actor: &str) -> Result<ImportResult, String> {
    let main = files.first().ok_or("ファイルがありません")?;
    let (parsed, source) = parse(&main.name, &main.bytes)?;
    // PDF は元のファイルを添付する。JSON は中身を登録済みなので、写真だけを添付する。
    let attachments: Vec<NewFile> = if source == "pdf" {
        files.clone()
    } else {
        files[1..].to_vec()
    };
    let staff = staff_candidates()?;
    let mut conn = model::open_db()?;
    let result = model::import_parsed(
        &mut conn,
        &parsed,
        source,
        &main.name,
        &attachments,
        &staff,
        actor,
    )?;
    if result.status == "created" {
        crate::events::notify();
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// フォルダの見張り

pub fn spawn(dir: PathBuf) {
    if let Err(error) = fs::create_dir_all(&dir) {
        log::warn!("{} を作れませんでした: {error}", dir.display());
    }
    log::info!("作業報告書の自動取り込みフォルダ: {}", dir.display());
    crate::treatment::watch::restore_processing(&dir);
    let started = std::thread::Builder::new()
        .name("work-report-watch".into())
        .spawn(move || loop {
            scan(&dir, SystemTime::now(), &|files| {
                import_files(files, WATCH_ACTOR)
            });
            std::thread::sleep(INTERVAL);
        });
    if let Err(error) = started {
        log::warn!("作業報告書の自動取り込みを開始できませんでした: {error}");
    }
}

fn settled(path: &Path, now: SystemTime) -> bool {
    let Ok(meta) = fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
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

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// JSON と一緒に添付する写真（JSON と同じ名前か、同じ名前に続けて `-2`・`_2`・` (2)` などが付いたもの）。
fn photos_for(json: &Path, entries: &[PathBuf]) -> Vec<PathBuf> {
    let base = stem(json);
    let mut photos: Vec<PathBuf> = entries
        .iter()
        .filter(|path| IMAGE_EXTENSIONS.contains(&extension(&file_name(path)).as_str()))
        .filter(|path| {
            let other = stem(path);
            other == base
                || other
                    .strip_prefix(&base)
                    .is_some_and(|rest| rest.starts_with(['-', '_', ' ', '(', '（']))
        })
        .cloned()
        .collect();
    photos.sort();
    photos
}

#[derive(Debug, PartialEq, Eq)]
pub struct Outcome {
    pub moved_to: PathBuf,
    pub ok: bool,
}

/// フォルダを 1 回調べ、PDF と JSON を取り込む。
pub fn scan<F>(dir: &Path, now: SystemTime, importer: &F) -> Vec<Outcome>
where
    F: Fn(Vec<NewFile>) -> Result<ImportResult, String>,
{
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut entries: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    entries.sort();
    let targets: Vec<PathBuf> = entries
        .iter()
        .filter(|path| {
            let name = file_name(path);
            !name.starts_with('.')
                && !name.starts_with("~$")
                && matches!(extension(&name).as_str(), "pdf" | "json")
        })
        .cloned()
        .collect();
    let mut outcomes = Vec::new();
    for target in targets {
        let mut group = vec![target.clone()];
        if extension(&file_name(&target)) == "json" {
            group.extend(photos_for(&target, &entries));
        }
        if !group.iter().all(|path| settled(path, now)) {
            continue;
        }
        if let Some(outcome) = process(dir, &group, importer) {
            outcomes.push(outcome);
        }
    }
    outcomes
}

fn process<F>(dir: &Path, group: &[PathBuf], importer: &F) -> Option<Outcome>
where
    F: Fn(Vec<NewFile>) -> Result<ImportResult, String>,
{
    let processing_dir = dir.join(PROCESSING_DIR);
    if let Err(error) = fs::create_dir_all(&processing_dir) {
        log::warn!("{} を作れませんでした: {error}", processing_dir.display());
        return None;
    }
    // まとめて `取込中` へ移す。移せないもの（開いたまま）があれば戻して次の回に回す。
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    for path in group {
        let processing = unique_path(&processing_dir.join(file_name(path)));
        if fs::rename(path, &processing).is_err() {
            for (original, processing) in moved {
                let _ = fs::rename(processing, original);
            }
            return None;
        }
        moved.push((path.clone(), processing));
    }

    let files: Result<Vec<NewFile>, String> = moved
        .iter()
        .map(|(original, processing)| {
            fs::read(processing)
                .map(|bytes| NewFile {
                    name: file_name(original),
                    bytes,
                })
                .map_err(|error| format!("ファイルを読めません: {error}"))
        })
        .collect();
    let result = files.and_then(importer);
    let ok = result.is_ok();

    let dest_dir = dir.join(if ok { DONE_DIR } else { ERROR_DIR });
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let _ = fs::create_dir_all(&dest_dir);
    let mut main_dest = None;
    for (original, processing) in &moved {
        let dest = unique_path(&dest_dir.join(format!("{stamp}_{}", file_name(original))));
        let dest = match fs::rename(processing, &dest) {
            Ok(()) => dest,
            Err(error) => {
                log::warn!("{} を移せませんでした: {error}", processing.display());
                processing.clone()
            }
        };
        main_dest.get_or_insert(dest);
    }
    let moved_to = main_dest?;

    let name = file_name(&group[0]);
    let text = report(&name, &moved, &result);
    let mut log_path = moved_to.clone().into_os_string();
    log_path.push(".log.txt");
    if let Err(error) = write_report(Path::new(&log_path), &text) {
        log::warn!("取り込み結果を書き出せませんでした: {error}");
    }
    log::info!("作業報告書を自動で取り込みました: {name}\n{text}");
    Some(Outcome { moved_to, ok })
}

fn report(
    name: &str,
    moved: &[(PathBuf, PathBuf)],
    result: &Result<ImportResult, String>,
) -> String {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let mut out = format!("ファイル: {name}\n取り込み日時: {now}\n");
    if moved.len() > 1 {
        let photos: Vec<String> = moved[1..].iter().map(|(path, _)| file_name(path)).collect();
        out.push_str(&format!("添付した写真: {}\n", photos.join("、")));
    }
    match result {
        Err(message) => out.push_str(&format!("結果: 取り込めませんでした\n理由: {message}\n")),
        Ok(result) => {
            out.push_str(&format!("結果: {}\n", result.message));
            for warning in &result.warnings {
                out.push_str(&format!("確認: {warning}\n"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rct_work_report_watch_{label}_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn later() -> SystemTime {
        SystemTime::now() + Duration::from_secs(60)
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    #[test]
    fn imports_json_with_its_photos() {
        let dir = temp_dir("json");
        fs::write(dir.join("報告書1.json"), b"{}").unwrap();
        fs::write(dir.join("報告書1.jpg"), b"a").unwrap();
        fs::write(dir.join("報告書1-2.JPG"), b"b").unwrap();
        fs::write(dir.join("報告書10.jpg"), b"c").unwrap();
        fs::write(dir.join("memo.txt"), b"m").unwrap();

        let outcomes = scan(&dir, later(), &|files: Vec<NewFile>| {
            let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
            assert_eq!(names, vec!["報告書1.json", "報告書1-2.JPG", "報告書1.jpg"]);
            Ok(ImportResult {
                status: "created".into(),
                report_id: 1,
                message: "要確認として登録しました".into(),
                warnings: vec!["担当技師が読み取れませんでした".into()],
            })
        });
        assert_eq!(outcomes.len(), 1);
        assert!(outcomes[0].ok);
        let done = names(&dir.join(DONE_DIR));
        assert_eq!(done.len(), 4);
        let log = done.iter().find(|n| n.ends_with(".log.txt")).unwrap();
        let log = fs::read_to_string(dir.join(DONE_DIR).join(log)).unwrap();
        assert!(log.contains("担当技師が読み取れませんでした"));
        // ほかの名前の写真と対象外のファイルは残す
        assert_eq!(
            names(&dir),
            vec!["memo.txt", PROCESSING_DIR, DONE_DIR, "報告書10.jpg"]
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unreadable_files_go_to_the_error_folder() {
        let dir = temp_dir("error");
        fs::write(dir.join("a.pdf"), b"%PDF").unwrap();
        let outcomes = scan(&dir, later(), &|_: Vec<NewFile>| Err("読めません".into()));
        assert!(!outcomes[0].ok);
        assert!(outcomes[0].moved_to.starts_with(dir.join(ERROR_DIR)));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_json() {
        let (parsed, source) = parse(
            "a.json",
            "\u{feff}{\"title\":\"MLC Error\",\"engineers\":[\"東 尚人\"]}".as_bytes(),
        )
        .unwrap();
        assert_eq!(source, "json");
        assert_eq!(parsed.title, "MLC Error");
        assert_eq!(parsed.engineers, vec!["東 尚人".to_string()]);
        assert!(parse("a.txt", b"hello").is_err());
    }
}
