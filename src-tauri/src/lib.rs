// src-tauri/src/lib.rs

mod db;
mod exam_order;
mod patient;

use crate::exam_order::model::ExamOrder;
use crate::patient::model::{Patient, PatientFields};

#[tauri::command]
fn add_patient(
    patient_id: String,
    patient_type: String,
    last_name_kanji: String,
    first_name_kanji: String,
    last_name_kana: String,
    first_name_kana: String,
    height: Option<f64>,
    weight: Option<f64>,
    birth_date: String,
    gender: String,
    created_at: Option<String>,
) -> Result<(), String> {
    let fields = PatientFields {
        patient_id,
        patient_type,
        last_name_kanji,
        first_name_kanji,
        last_name_kana,
        first_name_kana,
        height,
        weight,
        birth_date,
        gender,
        created_at,
    };
    patient::model::insert(&fields)
}

#[tauri::command]
fn get_patients() -> Result<Vec<Patient>, String> {
    patient::model::search(None, false)
}

#[tauri::command]
fn remove_patient(id: i32) -> Result<(), String> {
    patient::model::delete(id).map_err(|e| e.to_string())
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
    created_at: String,
) -> Result<(), String> {
    patient::model::update(
        id,
        &patient_id,
        &patient_type,
        &last_name_kanji,
        &first_name_kanji,
        &last_name_kana,
        &first_name_kana,
        &created_at,
    )
}

#[tauri::command]
fn search_patients_cmd(keyword: Option<String>, sort_desc: bool) -> Result<Vec<Patient>, String> {
    patient::model::search(keyword, sort_desc)
}

#[tauri::command]
fn add_exam_order(patient_db_id: i32, exam_date: String, exam_time: String) -> Result<(), String> {
    exam_order::model::insert_order(patient_db_id, &exam_date, &exam_time)
}

#[tauri::command]
fn get_exam_orders(patient_db_id: i32) -> Result<Vec<ExamOrder>, String> {
    exam_order::model::get_orders_by_patient(patient_db_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::init_db().expect("DB初期化失敗");

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
            search_patients_cmd,
            add_exam_order,
            get_exam_orders
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
