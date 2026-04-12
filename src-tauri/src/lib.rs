use rusqlite::Error;
use rusqlite::{Connection, Result};
use serde::Serialize;
use std::path::PathBuf;

fn get_db_path() -> PathBuf {
    let exe_path = std::env::current_exe().expect("実行ファイルパス取得失敗");
    let exe_dir = exe_path.parent().expect("親ディレクトリ取得失敗");
    exe_dir.join("patients.db")
}

fn init_db() -> Result<()> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;

    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL UNIQUE,
            patient_type TEXT NOT NULL,
            last_name_kanji TEXT NOT NULL DEFAULT '',
            first_name_kanji TEXT NOT NULL DEFAULT '',
            last_name_kana TEXT NOT NULL DEFAULT '',
            first_name_kana TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    Ok(())
}

fn insert_patient(
    patient_id: &str,
    patient_type: &str,
    last_name_kanji: &str,
    first_name_kanji: &str,
    last_name_kana: &str,
    first_name_kana: &str,
) -> Result<(), String> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;

    let normalized_id = normalize_and_validate(patient_id)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let result = tx.execute(
        "INSERT INTO patients (patient_id, patient_type, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        [&normalized_id, patient_type, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana],
    );

    match result {
        Ok(_) => {
            tx.commit().map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(Error::SqliteFailure(err, _))
            if err.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
        {
            Err("この患者IDは既に登録されています".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

fn delete_patient(id: i32) -> Result<()> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path)?;

    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    let tx = conn.transaction()?;

    tx.execute("DELETE FROM patients WHERE id = ?1", [id])?;

    tx.commit()?;

    Ok(())
}

fn update_patient(
    id: i32,
    patient_id: &str,
    patient_type: &str,
    last_name_kanji: &str,
    first_name_kanji: &str,
    last_name_kana: &str,
    first_name_kana: &str,
) -> Result<(), String> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;

    let normalized_id = normalize_and_validate(patient_id)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let result = tx.execute(
        "UPDATE patients SET patient_id = ?1, patient_type = ?2, last_name_kanji = ?3, first_name_kanji = ?4, last_name_kana = ?5, first_name_kana = ?6 WHERE id = ?7",
        [
            &normalized_id,
            patient_type,
            last_name_kanji,
            first_name_kanji,
            last_name_kana,
            first_name_kana,
            &id.to_string(),
        ],
    );

    match result {
        Ok(_) => {
            tx.commit().map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(Error::SqliteFailure(err, _))
            if err.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE =>
        {
            Err("この患者IDは既に登録されています".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

fn normalize_and_validate(input: &str) -> Result<String, String> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Err("患者IDは必須です".into());
    }

    if !trimmed.chars().all(|c| c.is_ascii_digit()) {
        return Err("患者IDは数字のみです".into());
    }

    if trimmed.len() > 10 {
        return Err("患者IDは10桁以内です".into());
    }

    Ok(format!("{:0>10}", trimmed))
}

fn search_patients(keyword: Option<String>, sort_desc: bool) -> Result<Vec<Patient>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut query = String::from("SELECT id, patient_id, patient_type, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana FROM patients");

    let keyword = keyword.unwrap_or_default();
    if !keyword.is_empty() {
        query.push_str(" WHERE patient_id LIKE ?1 OR last_name_kanji LIKE ?1 OR first_name_kanji LIKE ?1 OR last_name_kana LIKE ?1 OR first_name_kana LIKE ?1");
    }

    query.push_str(" ORDER BY created_at ");
    query.push_str(if sort_desc { "DESC" } else { "ASC" });

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mapper = |row: &rusqlite::Row| {
        Ok(Patient {
            id: row.get(0)?,
            patient_id: row.get(1)?,
            patient_type: row.get(2)?,
            last_name_kanji: row.get(3)?,
            first_name_kanji: row.get(4)?,
            last_name_kana: row.get(5)?,
            first_name_kana: row.get(6)?,
        })
    };

    let params = format!("%{}%", keyword);
    let patient_iter = if !keyword.is_empty() {
        stmt.query_map([&params], mapper)
    } else {
        stmt.query_map([], mapper)
    }
    .map_err(|e| e.to_string())?;

    let mut patients = Vec::new();
    for p in patient_iter {
        patients.push(p.map_err(|e| e.to_string())?);
    }
    Ok(patients)
}

#[derive(Serialize)]
struct Patient {
    id: i32,
    patient_id: String,
    patient_type: String,
    last_name_kanji: String,
    first_name_kanji: String,
    last_name_kana: String,
    first_name_kana: String,
}

#[tauri::command]
fn add_patient(
    patient_id: String,
    patient_type: String,
    last_name_kanji: String,
    first_name_kanji: String,
    last_name_kana: String,
    first_name_kana: String,
) -> Result<(), String> {
    insert_patient(
        &patient_id,
        &patient_type,
        &last_name_kanji,
        &first_name_kanji,
        &last_name_kana,
        &first_name_kana,
    )
}

#[tauri::command]
fn get_patients() -> Result<Vec<Patient>, String> {
    search_patients(None, false)
}

#[tauri::command]
fn remove_patient(id: i32) -> Result<(), String> {
    delete_patient(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn edit_patient(
    id: i32,
    patient_id: String,
    patient_type: String,
    last_name_kanji: String,
    first_name_kanji: String,
    last_name_kana: String,
    first_name_kana: String,
) -> Result<(), String> {
    update_patient(
        id,
        &patient_id,
        &patient_type,
        &last_name_kanji,
        &first_name_kanji,
        &last_name_kana,
        &first_name_kana,
    )
}

#[tauri::command]
fn search_patients_cmd(keyword: Option<String>, sort_desc: bool) -> Result<Vec<Patient>, String> {
    search_patients(keyword, sort_desc)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            init_db().expect("DB初期化失敗");

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_patient,
            get_patients,
            remove_patient,
            edit_patient,
            search_patients_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
