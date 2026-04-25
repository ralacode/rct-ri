// src-tauri/src/exam_order/model.rs

use crate::db::get_db_path;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ExamOrder {
    pub id: i32,
    pub patient_db_id: i32,
    pub exam_date: String,
    pub created_at: String,
}

// 検査オーダーの登録
pub fn insert_order(patient_db_id: i32, exam_date: &str) -> Result<(), String> {
    let db_path = get_db_path();
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO exam_orders (patient_db_id, exam_date) VALUES (?1, ?2)",
        [patient_db_id.to_string(), exam_date.to_string()],
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
        .prepare("SELECT id, patient_db_id, exam_date, created_at FROM exam_orders WHERE patient_db_id = ?1 ORDER BY exam_date DESC")
        .map_err(|e| e.to_string())?;

    let order_iter = stmt
        .query_map([patient_db_id], |row| {
            Ok(ExamOrder {
                id: row.get(0)?,
                patient_db_id: row.get(1)?,
                exam_date: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut orders = Vec::new();
    for order in order_iter {
        orders.push(order.map_err(|e| e.to_string())?);
    }
    Ok(orders)
}
