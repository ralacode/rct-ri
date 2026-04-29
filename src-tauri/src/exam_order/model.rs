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
    pub requesting_department: String,
    pub created_at: String,
}

// 検査オーダーの登録
pub fn insert_order(
    patient_db_id: i32,
    exam_date: &str,
    exam_time: &str,
    requesting_department: &str,
) -> Result<(), String> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // 現在の日本時間を取得して文字列にする (例: "2024-05-20 14:30:05")
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // SQLの created_at に明示的に Rust で生成した時間を入れます
    tx.execute(
        "INSERT INTO exam_orders (patient_db_id, exam_date, exam_time, requesting_department, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        [
            patient_db_id.to_string(),
            exam_date.to_string(),
            exam_time.to_string(),
            requesting_department.to_string(),
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
        .prepare("SELECT id, patient_db_id, exam_date, exam_time, requesting_department, created_at FROM exam_orders WHERE patient_db_id = ?1 ORDER BY exam_date DESC, exam_time DESC")
        .map_err(|e| e.to_string())?;

    let order_iter = stmt
        .query_map([patient_db_id], |row| {
            Ok(ExamOrder {
                id: row.get(0)?,
                patient_db_id: row.get(1)?,
                exam_date: row.get(2)?,
                exam_time: row.get(3)?,
                requesting_department: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut orders = Vec::new();
    for order in order_iter {
        orders.push(order.map_err(|e| e.to_string())?);
    }
    Ok(orders)
}
