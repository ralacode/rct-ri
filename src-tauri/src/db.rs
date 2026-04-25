// src-tauri/src/db.rs

use rusqlite::{Connection, Result};
use std::path::PathBuf;
// use std::time::Duration;

pub fn get_db_path() -> PathBuf {
    let exe_path = std::env::current_exe().expect("実行ファイルパス取得失敗");
    let exe_dir = exe_path.parent().expect("親ディレクトリ取得失敗");
    exe_dir.join("patients.db")
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

pub fn init_db() -> Result<()> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;

    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;
    conn.execute("PRAGMA foreign_keys = ON;", [])?;

    create_patients_table(&conn)?;
    create_exam_orders_table(&conn)?;

    Ok(())
}

fn create_patients_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL UNIQUE,
            patient_type TEXT NOT NULL,
            last_name_kanji TEXT NOT NULL DEFAULT '',
            first_name_kanji TEXT NOT NULL DEFAULT '',
            last_name_kana TEXT NOT NULL DEFAULT '',
            first_name_kana TEXT NOT NULL DEFAULT '',
            birth_date TEXT NOT NULL DEFAULT '',
            gender TEXT NOT NULL DEFAULT '',
            height REAL,
            weight REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_db_id) REFERENCES patients (id) ON DELETE CASCADE
        )",
        [],
    )?;
    Ok(())
}
