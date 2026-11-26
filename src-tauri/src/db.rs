// src-tauri/src/db.rs

use rusqlite::{Connection, Result};
use std::path::{Path, PathBuf};
// use std::time::Duration;

pub fn exe_dir() -> PathBuf {
    let exe_path = std::env::current_exe().expect("実行ファイルパス取得失敗");
    exe_path
        .parent()
        .expect("親ディレクトリ取得失敗")
        .to_path_buf()
}

pub fn get_videos_dir() -> PathBuf {
    exe_dir().join("videos")
}

/// exe と同じ階層の ris。将来、RIS のバッチが治療依頼 CSV をここへ置く。
pub fn get_ris_dir() -> PathBuf {
    exe_dir().join("ris")
}

/// DB ファイルをまとめて置くフォルダ（exe と同じ階層の db）。
pub fn get_db_dir() -> PathBuf {
    exe_dir().join("db")
}

const DB_FILE: &str = "rct_local.db";
const REQUESTERS_DB_FILE: &str = "requesters.db";
const USER_DB_FILE: &str = "user.db";
const FEEDBACK_DB_FILE: &str = "feedback.db";

/// db フォルダに置く DB ファイルの一覧（前の版からの移動に使う）。
const DB_FILES: [&str; 4] = [DB_FILE, REQUESTERS_DB_FILE, USER_DB_FILE, FEEDBACK_DB_FILE];

pub fn get_db_path() -> PathBuf {
    get_db_dir().join(DB_FILE)
}

/// 依頼科・依頼医の一覧（入力候補）。業務データとは別ファイルにする。
pub fn get_requesters_db_path() -> PathBuf {
    get_db_dir().join(REQUESTERS_DB_FILE)
}

pub fn get_user_db_path() -> PathBuf {
    get_db_dir().join(USER_DB_FILE)
}

/// 質問・要望（看護師・職員の投稿と回答）。業務データとは別ファイルにする。
pub fn get_feedback_db_path() -> PathBuf {
    get_db_dir().join(FEEDBACK_DB_FILE)
}

/// 前の版は DB ファイルを exe と同じ階層に置いていた。それを db フォルダへ移す。
///
/// - db フォルダ側にすでに同じ名前の DB があるときは、何もしない（古いほうはそのまま残す）
/// - WAL モードなので、`-wal`・`-shm` があれば一緒に移す（本体より先に移す）
///
/// 移動に失敗したまま起動すると、db フォルダに空の DB が作られてしまうため、エラーを返す。
fn migrate_to_db_dir(old_dir: &Path, new_dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(new_dir)?;
    for name in DB_FILES {
        let old_main = old_dir.join(name);
        let new_main = new_dir.join(name);
        if !old_main.exists() {
            continue;
        }
        if new_main.exists() {
            log::warn!(
                "{} は db フォルダにすでにあるため、古いファイル {} は移しません",
                name,
                old_main.display()
            );
            continue;
        }
        for suffix in ["-wal", "-shm"] {
            let old_side = old_dir.join(format!("{name}{suffix}"));
            if old_side.exists() {
                std::fs::rename(&old_side, new_dir.join(format!("{name}{suffix}")))?;
            }
        }
        std::fs::rename(&old_main, &new_main)?;
        log::info!("{} を {} へ移しました", old_main.display(), new_main.display());
    }
    Ok(())
}

// pub fn get_connection() -> Result<Connection, String> {
//     let db_path = get_db_path();
//     let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

//     // 接続時に毎回適用したい設定
//     conn.busy_timeout(Duration::from_secs(5))
//         .map_err(|e| e.to_string())?;
//     conn.execute("PRAGMA journal_mode = WAL;", [])
//         .map_err(|e| e.to_string())?;
//     conn.execute("PRAGMA foreign_keys = ON;", [])
//         .map_err(|e| e.to_string())?;

//     Ok(conn)
// }

pub fn init_db() -> std::result::Result<(), Box<dyn std::error::Error>> {
    migrate_to_db_dir(&exe_dir(), &get_db_dir())
        .map_err(|e| format!("DB ファイルを db フォルダへ移せませんでした: {e}"))?;

    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;

    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    create_patients_table(&conn)?;
    crate::patient::model::drop_patient_type_column(&conn)?;
    create_exam_orders_table(&conn)?;
    crate::treatment::model::init_tables(&conn)?;
    let _ = conn.execute("DROP TABLE IF EXISTS sessions", []);
    let _ = conn.execute("DROP TABLE IF EXISTS users", []);
    crate::patient::model::migrate_created_at_formats(&conn)?;

    // カラム追加のマイグレーション（すでに存在する場合は無視される）
    let _ = conn.execute(
        "ALTER TABLE patients ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
        [],
    );

    let _ = conn.execute(
        "ALTER TABLE exam_orders ADD COLUMN requesting_department TEXT NOT NULL DEFAULT ''",
        [],
    );

    let _ = conn.execute(
        "ALTER TABLE exam_orders ADD COLUMN requesting_physician TEXT NOT NULL DEFAULT ''",
        [],
    );

    let _ = conn.execute(
        "ALTER TABLE exam_orders ADD COLUMN exam_item TEXT NOT NULL DEFAULT ''",
        [],
    );

    // 投与時刻
    let _ = conn.execute("ALTER TABLE exam_orders ADD COLUMN injection_time TEXT", []);

    // 投与量・残量
    let _ = conn.execute("ALTER TABLE exam_orders ADD COLUMN dosage_mbq REAL", []);
    let _ = conn.execute("ALTER TABLE exam_orders ADD COLUMN dosage_ml REAL", []);
    let _ = conn.execute("ALTER TABLE exam_orders ADD COLUMN remain_mbq REAL", []);
    let _ = conn.execute("ALTER TABLE exam_orders ADD COLUMN remain_ml REAL", []);

    // アプリ全体の設定（施設名）
    crate::settings::init_tables(&conn)?;

    // 依頼科・依頼医の一覧は requesters.db に置く。
    // 初めて作るときは、前の版の一覧か既存のオーダー・治療依頼から名前を取り込む。
    crate::requester::init_db(&conn)?;

    init_user_db()?;
    init_feedback_db()?;
    let _ = std::fs::create_dir_all(get_videos_dir());
    log::info!(
        "RIS の CSV フォルダ（exe と同じ階層）: {}",
        get_ris_dir().display()
    );
    Ok(())
}

fn init_user_db() -> Result<()> {
    let conn = Connection::open(get_user_db_path())?;
    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;
    conn.execute("PRAGMA foreign_keys = ON;", [])?;
    crate::auth::init_tables(&conn)?;
    crate::videos::init_tables(&conn)?;
    Ok(())
}

fn init_feedback_db() -> Result<()> {
    let conn = Connection::open(get_feedback_db_path())?;
    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;
    crate::feedback::init_tables(&conn)?;
    Ok(())
}

fn create_patients_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL UNIQUE,
            last_name_kanji TEXT NOT NULL DEFAULT '',
            first_name_kanji TEXT NOT NULL DEFAULT '',
            last_name_kana TEXT NOT NULL DEFAULT '',
            first_name_kana TEXT NOT NULL DEFAULT '',
            birth_date TEXT NOT NULL DEFAULT '',
            gender TEXT NOT NULL DEFAULT '',
            height REAL,
            weight REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT ''
        )",
        [],
    )?;
    Ok(())
}

// 検査オーダー用テーブル
fn create_exam_orders_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS exam_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_db_id INTEGER NOT NULL,
            exam_date TEXT NOT NULL,
            exam_time TEXT NOT NULL DEFAULT '',
            exam_item TEXT NOT NULL DEFAULT '',
            requesting_department TEXT NOT NULL DEFAULT '',
            requesting_physician TEXT NOT NULL DEFAULT '',
            dosage_mbq REAL,
            dosage_ml REAL,
            remain_mbq REAL,
            remain_ml REAL,
            injection_time TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_db_id) REFERENCES patients (id) ON DELETE CASCADE
        )",
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rct_db_migrate_{label}_{}_{}",
            std::process::id(),
            chrono::Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn moves_old_files_with_wal_and_shm() {
        let base = temp_dir("move");
        let new_dir = base.join("db");
        fs::write(base.join("rct_local.db"), "main").unwrap();
        fs::write(base.join("rct_local.db-wal"), "wal").unwrap();
        fs::write(base.join("rct_local.db-shm"), "shm").unwrap();
        fs::write(base.join("user.db"), "user").unwrap();

        migrate_to_db_dir(&base, &new_dir).unwrap();

        assert_eq!(fs::read_to_string(new_dir.join("rct_local.db")).unwrap(), "main");
        assert_eq!(fs::read_to_string(new_dir.join("rct_local.db-wal")).unwrap(), "wal");
        assert_eq!(fs::read_to_string(new_dir.join("rct_local.db-shm")).unwrap(), "shm");
        assert_eq!(fs::read_to_string(new_dir.join("user.db")).unwrap(), "user");
        assert!(!base.join("rct_local.db").exists());
        assert!(!base.join("rct_local.db-wal").exists());
        assert!(!base.join("user.db").exists());
        // 前の版になかったファイルは作らない
        assert!(!new_dir.join("feedback.db").exists());

        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn keeps_existing_files_in_db_dir() {
        let base = temp_dir("keep");
        let new_dir = base.join("db");
        fs::create_dir_all(&new_dir).unwrap();
        fs::write(base.join("user.db"), "old").unwrap();
        fs::write(base.join("user.db-wal"), "old-wal").unwrap();
        fs::write(new_dir.join("user.db"), "new").unwrap();

        migrate_to_db_dir(&base, &new_dir).unwrap();

        assert_eq!(fs::read_to_string(new_dir.join("user.db")).unwrap(), "new");
        assert!(!new_dir.join("user.db-wal").exists());
        assert_eq!(fs::read_to_string(base.join("user.db")).unwrap(), "old");
        assert_eq!(fs::read_to_string(base.join("user.db-wal")).unwrap(), "old-wal");

        fs::remove_dir_all(&base).unwrap();
    }
}
