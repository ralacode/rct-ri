// src-tauri/src/exam_order/model.rs

use crate::db::get_db_path;
use chrono::Local;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ExamOrder {
    pub id: i32,
    pub patient_db_id: i32,
    pub exam_date: String,
    pub exam_time: String,
    pub exam_item: String,
    pub requesting_department: String,
    pub requesting_physician: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ExamOrderWithPatient {
    pub id: i32,
    pub patient_db_id: i32,
    pub patient_id: String,
    pub last_name_kanji: String,
    pub first_name_kanji: String,
    pub last_name_kana: String,
    pub first_name_kana: String,
    pub height: Option<f64>,
    pub weight: Option<f64>,
    pub exam_date: String,
    pub exam_time: String,
    pub exam_item: String,
    pub birth_date: String,
    pub gender: String,
    pub requesting_department: String,
    pub requesting_physician: String,
}

// 検査オーダーの登録
pub fn insert_order(
    patient_db_id: i32,
    exam_date: &str,
    exam_time: &str,
    exam_item: &str,
    requesting_department: &str,
    requesting_physician: &str,
) -> Result<(), String> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // 現在の日本時間を取得して文字列にする (例: "2024-05-20 14:30:05")
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // SQLの created_at に明示的に Rust で生成した時間を入れます
    tx.execute(
        "INSERT INTO exam_orders (patient_db_id, exam_date, exam_time, exam_item, requesting_department, requesting_physician, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        [
            patient_db_id.to_string(),
            exam_date.to_string(),
            exam_time.to_string(),
            exam_item.to_string(),
            requesting_department.to_string(),
            requesting_physician.to_string(), // 追加
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// 特定の患者に紐づく検査オーダー一覧の取得
pub fn get_orders_by_patient(patient_db_id: i32) -> Result<Vec<ExamOrder>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, patient_db_id, exam_date, exam_time, exam_item, requesting_department, requesting_physician, created_at FROM exam_orders WHERE patient_db_id = ?1 ORDER BY exam_date DESC, exam_time DESC")
        .map_err(|e| e.to_string())?;

    let order_iter = stmt
        .query_map([patient_db_id], |row| {
            Ok(ExamOrder {
                id: row.get(0)?,
                patient_db_id: row.get(1)?,
                exam_date: row.get(2)?,
                exam_time: row.get(3)?,
                exam_item: row.get(4)?,
                requesting_department: row.get(5)?,
                requesting_physician: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut orders = Vec::new();
    for order in order_iter {
        orders.push(order.map_err(|e| e.to_string())?);
    }
    Ok(orders)
}

pub fn get_orders_by_date(date: &str) -> Result<Vec<ExamOrderWithPatient>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                o.id,
                o.patient_db_id,
                p.patient_id,
                p.last_name_kanji,
                p.first_name_kanji, 
                p.last_name_kana,
                p.first_name_kana,
                p.height,
                p.weight,
                o.exam_date,
                o.exam_time,
                o.exam_item,
                p.birth_date,
                p.gender,
                o.requesting_department,
                o.requesting_physician
             FROM exam_orders o
             JOIN patients p ON o.patient_db_id = p.id
             WHERE o.exam_date = ?1
             ORDER BY o.exam_time DESC",
        )
        .map_err(|e| e.to_string())?;

    let order_iter = stmt
        .query_map([date], |row| {
            Ok(ExamOrderWithPatient {
                id: row.get(0)?,
                patient_db_id: row.get(1)?,
                patient_id: row.get(2)?,
                last_name_kanji: row.get(3)?,
                first_name_kanji: row.get(4)?,
                last_name_kana: row.get(5)?,
                first_name_kana: row.get(6)?,
                height: row.get(7)?,
                weight: row.get(8)?,
                exam_date: row.get(9)?,
                exam_time: row.get(10)?,
                exam_item: row.get(11)?,
                birth_date: row.get(12)?,
                gender: row.get(13)?,
                requesting_department: row.get(14)?,
                requesting_physician: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut orders = Vec::new();
    for order in order_iter {
        orders.push(order.map_err(|e| e.to_string())?);
    }
    Ok(orders)
}
