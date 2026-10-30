// src-tauri/src/patient/model.rs

use serde::Serialize;
use rusqlite::{Connection, Result, Error};
use crate::db::get_db_path;

#[derive(Serialize)]
pub struct Patient {
    pub id: i32,
    pub patient_id: String,
    pub patient_type: String,
    pub last_name_kanji: String,
    pub first_name_kanji: String,
    pub last_name_kana: String,
    pub first_name_kana: String,
    pub height: Option<f64>,
    pub weight: Option<f64>,
    pub birth_date: String,
    pub gender: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct PatientFields {
    pub patient_id: String,
    pub patient_type: String,
    pub last_name_kanji: String,
    pub first_name_kanji: String,
    pub last_name_kana: String,
    pub first_name_kana: String,
    pub height: Option<f64>,
    pub weight: Option<f64>,
    pub birth_date: String,
    pub gender: String,
    pub created_at: Option<String>,
}

pub fn normalize_and_validate(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() { return Err("患者IDは必須です".into()); }
    if !trimmed.chars().all(|c| c.is_ascii_digit()) { return Err("患者IDは数字のみです".into()); }
    if trimmed.len() > 10 { return Err("患者IDは10桁以内です".into()); }
    Ok(format!("{:0>10}", trimmed))
}

/// `YYYY-MM-DD HH:MM:SS` に揃える。日付だけの今日は現在時刻、過去日は 00:00:00。
pub fn normalize_created_at(raw: Option<&str>, use_now_for_today: bool) -> String {
    let now = chrono::Local::now();
    let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return now_str;
    };

    let nums: Vec<u32> = raw
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect();

    if nums.len() < 3 {
        return now_str;
    }

    let year = nums[0] as i32;
    let month = nums[1];
    let day = nums[2];
    let Some(date) = chrono::NaiveDate::from_ymd_opt(year, month, day) else {
        return now_str;
    };

    let (hour, minute, second) = if nums.len() >= 6 {
        (nums[3], nums[4], nums[5])
    } else if nums.len() >= 5 {
        (nums[3], nums[4], 0)
    } else if nums.len() >= 4 {
        (nums[3], 0, 0)
    } else if use_now_for_today && date == now.date_naive() {
        return now_str;
    } else {
        (0, 0, 0)
    };

    date.and_hms_opt(hour, minute, second)
        .map(|datetime| datetime.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or(now_str)
}

pub fn migrate_created_at_formats(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("SELECT id, created_at FROM patients")?;
    let rows: Vec<(i32, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    drop(stmt);

    for (id, created_at) in rows {
        let normalized = normalize_created_at(Some(&created_at), false);
        if normalized != created_at {
            conn.execute(
                "UPDATE patients SET created_at = ?1 WHERE id = ?2",
                rusqlite::params![normalized, id],
            )?;
        }
    }
    Ok(())
}

pub fn insert(
    p: &PatientFields,
) -> Result<(), String> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;

    let normalized_id = normalize_and_validate(&p.patient_id)?;
    if p.birth_date.trim().is_empty() { return Err("生年月日は必須です".into()); }

    let final_created_at = normalize_created_at(p.created_at.as_deref(), true);

    // 新規登録時も現在の日本時間を更新日時の初期値として設定
    let final_updated_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let result = tx.execute(
        "INSERT INTO patients (patient_id, patient_type, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, birth_date, gender, height, weight, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            &normalized_id,
            &p.patient_type,
            &p.last_name_kanji,
            &p.first_name_kanji, 
            &p.last_name_kana,
            &p.first_name_kana,
            &p.birth_date,
            &p.gender,
            p.height, // そのまま渡せるようになります
            p.weight, // そのまま渡せるようになります
            &final_created_at,
            &final_updated_at,
        ],
    );

    match result {
        Ok(_) => {
            tx.commit().map_err(|e| e.to_string())?;
            crate::events::notify();
            Ok(())
        }
        Err(Error::SqliteFailure(err, _)) if err.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE => {
            Err("この患者IDは既に登録されています".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete(id: i32) -> Result<()> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path)?;

    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    let tx = conn.transaction()?;

    tx.execute("DELETE FROM patients WHERE id = ?1", [id])?;

    tx.commit()?;
    crate::events::notify();

    Ok(())
}

pub fn update(
    id: i32,
    patient_id: &str,
    patient_type: &str,
    last_name_kanji: &str,
    first_name_kanji: &str,
    last_name_kana: &str,
    first_name_kana: &str,
    birth_date: &str,
    gender: &str,
    height: Option<f64>,
    weight: Option<f64>,
    created_at: &str,
) -> Result<(), String> {
  	let db_path = get_db_path();
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;

    let normalized_id = normalize_and_validate(patient_id)?;
    let normalized_created_at = normalize_created_at(Some(created_at), false);

    // 更新処理時のシステム現在時刻を取得
    let current_updated_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let result = tx.execute(
        "UPDATE patients SET patient_id = ?1, patient_type = ?2, last_name_kanji = ?3, first_name_kanji = ?4, last_name_kana = ?5, first_name_kana = ?6, birth_date = ?7, gender = ?8, height = ?9, weight = ?10, created_at = ?11, updated_at = ?12 WHERE id = ?13",
        rusqlite::params![
            &normalized_id,
            patient_type,
            last_name_kanji,
            first_name_kanji,
            last_name_kana,
            first_name_kana,
            birth_date,
            gender,
            height,
            weight,
            &normalized_created_at,
            &current_updated_at,
            &id,
        ],
    );

    match result {
        Ok(_) => {
            tx.commit().map_err(|e| e.to_string())?;
            crate::events::notify();
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

pub fn search(keyword: Option<String>, sort_desc: bool) -> Result<Vec<Patient>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut query = String::from("SELECT id, patient_id, patient_type, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, height, weight, birth_date, gender, created_at, updated_at FROM patients");

    let keyword = keyword.unwrap_or_default();
    if !keyword.is_empty() {
        query.push_str(" WHERE patient_id LIKE ?1 OR last_name_kanji LIKE ?1 OR first_name_kanji LIKE ?1 OR last_name_kana LIKE ?1 OR first_name_kana LIKE ?1");
    }

    query.push_str(" ORDER BY created_at ");
    query.push_str(if sort_desc {
        "DESC, id DESC"
    } else {
        "ASC, id ASC"
    });

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
            height: row.get(7)?,
            weight: row.get(8)?,
            birth_date: row.get(9)?,
            gender: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
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