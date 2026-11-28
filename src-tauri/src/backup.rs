// src-tauri/src/backup.rs
//! DB の自動バックアップ。
//!
//! - バックアップ先のフォルダ（外付け HDD など）は設定画面で決め、rct_local.db の app_settings に持つ。
//! - 毎日 9:00 と 16:00 に、db フォルダの DB（作業報告書を含む） をバックアップ先の `YYYYMMDD_HHMMSS` フォルダへ書き出す。
//!   アプリが止まっていた・HDD が外れていたなどで時刻を逃したときは、次に動けたときに 1 回だけ取り直す。
//!   失敗したときは [`RETRY`] ごとにやり直す。
//! - 書き出しは SQLite の `VACUUM INTO` を使う。アプリを動かしたまま（WAL の中身も含めて）
//!   その時点の DB をそのまま 1 つのファイルにできるので、`-wal`・`-shm` はいらない。
//! - 書き出し中は `YYYYMMDD_HHMMSS.partial` に作り、すべて書けてから名前を変える。
//! - バックアップのフォルダは新しいものから [`KEEP`] 個だけ残し、古いものは消す。
//!   消すのはこのアプリが作った名前のフォルダだけで、ほかのファイルには触らない。
//! - 動画（videos）は対象外。

use crate::auth::AuthUser;
use crate::db::{
    get_db_dir, get_db_path, get_feedback_db_path, get_requesters_db_path, get_user_db_path,
    get_work_report_db_path,
};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use chrono::{Duration as ChronoDuration, Local, NaiveDateTime, NaiveTime};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

/// バックアップを取る時刻（時, 分）。
pub const TIMES: [(u32, u32); 2] = [(9, 0), (16, 0)];
/// 残すバックアップの数。
pub const KEEP: usize = 30;
/// 失敗したときにやり直すまでの間隔。
const RETRY: ChronoDuration = ChronoDuration::minutes(10);
/// 時刻になったかを調べる間隔。
const TICK: Duration = Duration::from_secs(30);

const PARTIAL_SUFFIX: &str = ".partial";
const FOLDER_FORMAT: &str = "%Y%m%d_%H%M%S";
const SLOT_FORMAT: &str = "%Y-%m-%d %H:%M";
const TIME_FORMAT: &str = "%Y-%m-%d %H:%M:%S";

const KEY_DIR: &str = "backup_dir";
const KEY_DONE_SLOT: &str = "backup_done_slot";
const KEY_LAST_AT: &str = "backup_last_at";
const KEY_LAST_OK: &str = "backup_last_ok";
const KEY_LAST_MESSAGE: &str = "backup_last_message";

/// 同時に 2 つのバックアップが走らないようにする。
static RUNNING: Mutex<()> = Mutex::new(());

/// バックアップする DB（ファイル名, パス）。
fn sources() -> Vec<(&'static str, PathBuf)> {
    vec![
        ("rct_local.db", get_db_path()),
        ("requesters.db", get_requesters_db_path()),
        ("user.db", get_user_db_path()),
        ("feedback.db", get_feedback_db_path()),
        ("work_report.db", get_work_report_db_path()),
    ]
}

// ---- 時刻の計算 ----

fn slot_on(date: chrono::NaiveDate, (hour, minute): (u32, u32)) -> NaiveDateTime {
    date.and_time(NaiveTime::from_hms_opt(hour, minute, 0).expect("正しい時刻"))
}

/// `now` 以前でいちばん新しいバックアップの時刻。
pub fn latest_slot(now: NaiveDateTime) -> NaiveDateTime {
    let today = now.date();
    let yesterday = today - ChronoDuration::days(1);
    [yesterday, today]
        .into_iter()
        .flat_map(|date| TIMES.into_iter().map(move |time| slot_on(date, time)))
        .filter(|slot| *slot <= now)
        .max()
        .expect("前日の時刻は必ず now より前")
}

/// `now` より後でいちばん近いバックアップの時刻。
pub fn next_slot(now: NaiveDateTime) -> NaiveDateTime {
    let today = now.date();
    let tomorrow = today + ChronoDuration::days(1);
    [today, tomorrow]
        .into_iter()
        .flat_map(|date| TIMES.into_iter().map(move |time| slot_on(date, time)))
        .filter(|slot| *slot > now)
        .min()
        .expect("翌日の時刻は必ず now より後")
}

/// いまバックアップを取るべきか。`done_slot` は最後に取り終えた時刻の枠。
pub fn is_due(now: NaiveDateTime, done_slot: Option<NaiveDateTime>) -> bool {
    done_slot.is_none_or(|done| done < latest_slot(now))
}

// ---- バックアップ本体 ----

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    /// フォルダ名（YYYYMMDD_HHMMSS）
    pub name: String,
    /// 取った日時（YYYY-MM-DD HH:MM:SS）
    pub at: String,
}

fn parse_folder_name(name: &str) -> Option<NaiveDateTime> {
    if name.len() != 15 {
        return None;
    }
    NaiveDateTime::parse_from_str(name, FOLDER_FORMAT).ok()
}

/// バックアップ先にある、このアプリが作ったバックアップ（新しい順）。
pub fn list_backups(dest: &Path) -> std::io::Result<Vec<BackupEntry>> {
    let mut entries: Vec<(NaiveDateTime, String)> = fs::read_dir(dest)?
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            parse_folder_name(&name).map(|at| (at, name))
        })
        .collect();
    entries.sort();
    entries.reverse();
    Ok(entries
        .into_iter()
        .map(|(at, name)| BackupEntry {
            name,
            at: at.format(TIME_FORMAT).to_string(),
        })
        .collect())
}

/// 新しいものから `keep` 個を残して古いバックアップを消す。書きかけで残った `.partial` も消す。
fn prune(dest: &Path, keep: usize) -> std::io::Result<usize> {
    let mut removed = 0;
    for old in list_backups(dest)?.into_iter().skip(keep) {
        fs::remove_dir_all(dest.join(&old.name))?;
        removed += 1;
    }
    for entry in fs::read_dir(dest)?.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if let Some(stem) = name.strip_suffix(PARTIAL_SUFFIX) {
            if parse_folder_name(stem).is_some() && entry.path().is_dir() {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    Ok(removed)
}

fn export_db(source: &Path, target: &Path) -> Result<(), String> {
    let conn = Connection::open(source).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(30))
        .map_err(|e| e.to_string())?;
    let target_text = target
        .to_str()
        .ok_or_else(|| format!("{} は使えないパスです", target.display()))?;
    conn.execute("VACUUM INTO ?1", params![target_text])
        .map_err(|e| e.to_string())?;
    drop(conn);
    // 書き出したファイルが壊れていないか確かめる
    let copy = Connection::open_with_flags(target, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    let check: String = copy
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if check != "ok" {
        return Err(format!(
            "書き出したファイルの検査で問題が見つかりました: {check}"
        ));
    }
    Ok(())
}

/// `dest` に `now` の名前でバックアップを作り、古いものを消す。作ったフォルダを返す。
pub fn backup_to(
    dest: &Path,
    sources: &[(&str, PathBuf)],
    now: NaiveDateTime,
    keep: usize,
) -> Result<PathBuf, String> {
    if !dest.is_dir() {
        return Err(format!(
            "バックアップ先 {} が見つかりません。外付け HDD がつながっているか確認してください",
            dest.display()
        ));
    }
    let name = now.format(FOLDER_FORMAT).to_string();
    let folder = dest.join(&name);
    if folder.exists() {
        return Err(format!("{} はすでにあります", folder.display()));
    }
    let partial = dest.join(format!("{name}{PARTIAL_SUFFIX}"));
    let result = (|| {
        if partial.exists() {
            fs::remove_dir_all(&partial).map_err(|e| e.to_string())?;
        }
        fs::create_dir_all(&partial).map_err(|e| e.to_string())?;
        for (file, source) in sources {
            if !source.exists() {
                continue;
            }
            export_db(source, &partial.join(file)).map_err(|e| format!("{file}: {e}"))?;
        }
        fs::rename(&partial, &folder).map_err(|e| e.to_string())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&partial);
        return Err(format!(
            "バックアップに失敗しました（{}）: {error}",
            dest.display()
        ));
    }
    if let Err(error) = prune(dest, keep) {
        log::warn!("古いバックアップを消せませんでした: {error}");
    }
    Ok(folder)
}

// ---- 設定と状態（app_settings） ----

fn open() -> Result<Connection, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn get_value(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn set_value(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let now = Local::now().format(TIME_FORMAT).to_string();
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// 設定されたバックアップ先。未設定なら None。
pub fn backup_dir_on(conn: &Connection) -> Result<Option<PathBuf>, String> {
    Ok(get_value(conn, KEY_DIR)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from))
}

/// バックアップ先を確かめて保存する。空欄なら自動バックアップを止める。
/// フォルダがなければ作り、書き込めるかを試す。保存したパスを返す。
pub fn set_backup_dir_on(
    conn: &Connection,
    raw: &str,
    db_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    let text = raw.trim();
    if text.is_empty() {
        set_value(conn, KEY_DIR, "")?;
        return Ok(None);
    }
    let dir = PathBuf::from(text);
    if !dir.is_absolute() {
        return Err("バックアップ先は E:\\RCT_backup のように、ドライブから書いてください".into());
    }
    let inside_db = dir.starts_with(db_dir)
        || matches!(
            (fs::canonicalize(&dir), fs::canonicalize(db_dir)),
            (Ok(dir_full), Ok(db_full)) if dir_full.starts_with(&db_full)
        );
    if inside_db {
        return Err("db フォルダの中はバックアップ先にできません".into());
    }
    fs::create_dir_all(&dir).map_err(|e| {
        format!(
            "{} を作れませんでした。外付け HDD がつながっているか確認してください（{e}）",
            dir.display()
        )
    })?;
    let probe = dir.join(".rct_write_test");
    fs::write(&probe, b"ok")
        .map_err(|e| format!("{} に書き込めませんでした（{e}）", dir.display()))?;
    let _ = fs::remove_file(&probe);
    set_value(conn, KEY_DIR, text)?;
    Ok(Some(dir))
}

fn done_slot_on(conn: &Connection) -> Result<Option<NaiveDateTime>, String> {
    Ok(get_value(conn, KEY_DONE_SLOT)?
        .and_then(|value| NaiveDateTime::parse_from_str(&value, SLOT_FORMAT).ok()))
}

fn record_result(conn: &Connection, now: NaiveDateTime, result: &Result<PathBuf, String>) {
    let (ok, message) = match result {
        Ok(folder) => ("1", folder.display().to_string()),
        Err(error) => ("0", error.clone()),
    };
    let at = now.format(TIME_FORMAT).to_string();
    let mut writes = vec![
        (KEY_LAST_AT, at),
        (KEY_LAST_OK, ok.to_string()),
        (KEY_LAST_MESSAGE, message),
    ];
    if result.is_ok() {
        writes.push((
            KEY_DONE_SLOT,
            latest_slot(now).format(SLOT_FORMAT).to_string(),
        ));
    }
    for (key, value) in writes {
        if let Err(error) = set_value(conn, key, &value) {
            log::warn!("バックアップの結果を記録できませんでした: {error}");
        }
    }
}

/// いまバックアップを取り、結果を記録する。ほかのバックアップが走っているときはエラー。
fn run_now() -> Result<PathBuf, String> {
    let Ok(_guard) = RUNNING.try_lock() else {
        return Err("ほかのバックアップを実行中です。しばらくしてからやり直してください".into());
    };
    let conn = open()?;
    let dir = backup_dir_on(&conn)?.ok_or("バックアップ先が設定されていません")?;
    let now = Local::now().naive_local();
    let result = backup_to(&dir, &sources(), now, KEEP);
    record_result(&conn, now, &result);
    match &result {
        Ok(folder) => log::info!("DB をバックアップしました: {}", folder.display()),
        Err(error) => log::warn!("{error}"),
    }
    crate::events::notify();
    result
}

/// 時刻ごとのバックアップを受け持つスレッドを立ち上げる。
pub fn spawn() {
    let started = std::thread::Builder::new()
        .name("db-backup".into())
        .spawn(|| {
            let mut retry_after: Option<NaiveDateTime> = None;
            loop {
                tick(&mut retry_after);
                std::thread::sleep(TICK);
            }
        });
    if let Err(error) = started {
        log::warn!("DB の自動バックアップを開始できませんでした: {error}");
    }
}

fn tick(retry_after: &mut Option<NaiveDateTime>) {
    let now = Local::now().naive_local();
    if retry_after.is_some_and(|at| now < at) {
        return;
    }
    let Ok(conn) = open() else {
        return;
    };
    if !matches!(backup_dir_on(&conn), Ok(Some(_))) {
        return;
    }
    let Ok(done) = done_slot_on(&conn) else {
        return;
    };
    drop(conn);
    if !is_due(now, done) {
        return;
    }
    *retry_after = match run_now() {
        Ok(_) => None,
        Err(_) => Some(now + RETRY),
    };
}

// ---- HTTP ----

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupStatus {
    dir: Option<String>,
    times: Vec<String>,
    keep: usize,
    next_at: Option<String>,
    last_at: Option<String>,
    last_ok: Option<bool>,
    last_message: Option<String>,
    /// バックアップ先を開けたか（外付け HDD が外れていると false）
    dir_available: bool,
    backups: Vec<BackupEntry>,
}

fn status() -> Result<BackupStatus, String> {
    let conn = open()?;
    let dir = backup_dir_on(&conn)?;
    let now = Local::now().naive_local();
    let listed = dir.as_deref().map(list_backups);
    Ok(BackupStatus {
        dir: dir.as_ref().map(|dir| dir.display().to_string()),
        times: TIMES
            .iter()
            .map(|(hour, minute)| format!("{hour}:{minute:02}"))
            .collect(),
        keep: KEEP,
        next_at: dir
            .as_ref()
            .map(|_| next_slot(now).format(TIME_FORMAT).to_string()),
        last_at: get_value(&conn, KEY_LAST_AT)?,
        last_ok: get_value(&conn, KEY_LAST_OK)?.map(|value| value == "1"),
        last_message: get_value(&conn, KEY_LAST_MESSAGE)?,
        dir_available: matches!(listed, Some(Ok(_))),
        backups: listed.and_then(Result::ok).unwrap_or_default(),
    })
}

fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        "バックアップの設定を変更する権限がありません",
    )
        .into_response()
}

fn status_response() -> Response {
    match status() {
        Ok(status) => Json(status).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn get_backup(Extension(actor): Extension<AuthUser>) -> Response {
    if !actor.can_manage() {
        return forbidden();
    }
    status_response()
}

#[derive(Deserialize)]
struct BackupDirBody {
    dir: String,
}

async fn put_backup_dir(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<BackupDirBody>,
) -> Response {
    if !actor.can_manage() {
        return forbidden();
    }
    let saved = tokio::task::spawn_blocking(move || {
        open().and_then(|conn| set_backup_dir_on(&conn, &body.dir, &get_db_dir()))
    })
    .await
    .unwrap_or_else(|error| Err(error.to_string()));
    match saved {
        Ok(_) => {
            crate::events::notify();
            status_response()
        }
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn post_backup_run(Extension(actor): Extension<AuthUser>) -> Response {
    if !actor.can_manage() {
        return forbidden();
    }
    let result = tokio::task::spawn_blocking(run_now)
        .await
        .unwrap_or_else(|error| Err(error.to_string()));
    match result {
        Ok(_) => status_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

/// どれも担当者管理権限を持つ人だけが使える。
pub fn routes() -> Router {
    Router::new()
        .route("/settings/backup", get(get_backup))
        .route("/settings/backup/dir", axum::routing::put(put_backup_dir))
        .route("/settings/backup/run", post(post_backup_run))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M").unwrap()
    }

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rct_backup_{label}_{}_{}",
            std::process::id(),
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn make_db(path: &Path, value: &str) {
        let conn = Connection::open(path).unwrap();
        conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))
            .unwrap();
        conn.execute("CREATE TABLE t (v TEXT)", []).unwrap();
        conn.execute("INSERT INTO t (v) VALUES (?1)", params![value])
            .unwrap();
        // 接続を開いたままにして、WAL に残った変更もバックアップに入ることを確かめる
        std::mem::forget(conn);
    }

    fn read_value(path: &Path) -> String {
        Connection::open(path)
            .unwrap()
            .query_row("SELECT v FROM t", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn slots_follow_nine_and_sixteen() {
        assert_eq!(latest_slot(at("2026-11-26 08:59")), at("2026-11-25 16:00"));
        assert_eq!(latest_slot(at("2026-11-26 09:00")), at("2026-11-26 09:00"));
        assert_eq!(latest_slot(at("2026-11-26 15:59")), at("2026-11-26 09:00"));
        assert_eq!(latest_slot(at("2026-11-26 23:00")), at("2026-11-26 16:00"));
        assert_eq!(next_slot(at("2026-11-26 08:59")), at("2026-11-26 09:00"));
        assert_eq!(next_slot(at("2026-11-26 09:00")), at("2026-11-26 16:00"));
        assert_eq!(next_slot(at("2026-11-26 16:30")), at("2026-11-27 09:00"));
    }

    #[test]
    fn due_once_per_slot_and_catches_up_missed_one() {
        assert!(is_due(at("2026-11-26 09:00"), None));
        assert!(is_due(at("2026-11-26 09:00"), Some(at("2026-11-25 16:00"))));
        assert!(!is_due(
            at("2026-11-26 09:30"),
            Some(at("2026-11-26 09:00"))
        ));
        assert!(!is_due(
            at("2026-11-26 15:59"),
            Some(at("2026-11-26 09:00"))
        ));
        assert!(is_due(at("2026-11-26 16:00"), Some(at("2026-11-26 09:00"))));
        // 何日も止まっていても、次に動いたときに 1 回取る
        assert!(is_due(at("2026-11-30 10:00"), Some(at("2026-11-26 16:00"))));
    }

    #[test]
    fn backs_up_all_dbs_including_wal_contents() {
        let base = temp_dir("copy");
        let src = base.join("db");
        let dest = base.join("hdd");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();
        make_db(&src.join("a.db"), "alpha");
        make_db(&src.join("b.db"), "beta");
        let sources = vec![
            ("a.db", src.join("a.db")),
            ("b.db", src.join("b.db")),
            ("missing.db", src.join("missing.db")),
        ];

        let folder = backup_to(&dest, &sources, at("2026-11-26 09:00"), KEEP).unwrap();

        assert_eq!(folder, dest.join("20261126_090000"));
        assert_eq!(read_value(&folder.join("a.db")), "alpha");
        assert_eq!(read_value(&folder.join("b.db")), "beta");
        assert!(!folder.join("missing.db").exists());
        assert!(!folder.join("a.db-wal").exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn keeps_only_newest_backups_and_leaves_other_files() {
        let base = temp_dir("prune");
        let src = base.join("db");
        let dest = base.join("hdd");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(dest.join("自分のフォルダ")).unwrap();
        fs::write(dest.join("memo.txt"), "memo").unwrap();
        fs::create_dir_all(dest.join("20200101_000000.partial")).unwrap();
        make_db(&src.join("a.db"), "alpha");
        let sources = vec![("a.db", src.join("a.db"))];

        let start = at("2026-11-01 09:00");
        for i in 0..5 {
            backup_to(&dest, &sources, start + ChronoDuration::hours(i), 3).unwrap();
        }

        let names: Vec<String> = list_backups(&dest)
            .unwrap()
            .into_iter()
            .map(|entry| entry.name)
            .collect();
        assert_eq!(
            names,
            vec!["20261101_130000", "20261101_120000", "20261101_110000"]
        );
        assert!(dest.join("自分のフォルダ").is_dir());
        assert!(dest.join("memo.txt").is_file());
        assert!(!dest.join("20200101_000000.partial").exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn fails_when_drive_is_missing() {
        let base = temp_dir("missing");
        let error =
            backup_to(&base.join("unplugged"), &[], at("2026-11-26 09:00"), KEEP).unwrap_err();
        assert!(error.contains("外付け HDD"));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn saves_and_validates_backup_dir() {
        let base = temp_dir("dir");
        let db_dir = base.join("db");
        fs::create_dir_all(&db_dir).unwrap();
        let conn = Connection::open_in_memory().unwrap();
        crate::settings::init_tables(&conn).unwrap();

        assert_eq!(backup_dir_on(&conn).unwrap(), None);
        assert!(set_backup_dir_on(&conn, "relative/dir", &db_dir).is_err());
        assert!(set_backup_dir_on(&conn, db_dir.join("x").to_str().unwrap(), &db_dir).is_err());

        let target = base.join("hdd").join("RCT_backup");
        let saved =
            set_backup_dir_on(&conn, &format!("  {}  ", target.display()), &db_dir).unwrap();
        assert_eq!(saved.as_deref(), Some(target.as_path()));
        assert!(target.is_dir());
        assert!(!target.join(".rct_write_test").exists());
        assert_eq!(
            backup_dir_on(&conn).unwrap().as_deref(),
            Some(target.as_path())
        );

        assert_eq!(set_backup_dir_on(&conn, " ", &db_dir).unwrap(), None);
        assert_eq!(backup_dir_on(&conn).unwrap(), None);
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn records_done_slot_only_on_success() {
        let conn = Connection::open_in_memory().unwrap();
        crate::settings::init_tables(&conn).unwrap();

        record_result(&conn, at("2026-11-26 09:00"), &Err("外れています".into()));
        assert_eq!(done_slot_on(&conn).unwrap(), None);
        assert_eq!(get_value(&conn, KEY_LAST_OK).unwrap().as_deref(), Some("0"));

        record_result(&conn, at("2026-11-26 09:10"), &Ok(PathBuf::from("E:/b")));
        assert_eq!(done_slot_on(&conn).unwrap(), Some(at("2026-11-26 09:00")));
        assert_eq!(get_value(&conn, KEY_LAST_OK).unwrap().as_deref(), Some("1"));
    }
}
