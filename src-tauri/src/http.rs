// src-tauri/src/http.rs
// 院内 LAN 向け HTTP API（認証なし・試用）。SQLite はローカルのまま。

use crate::exam_order;
use crate::patient::model::{self as patient_model, PatientFields};
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, patch};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

pub const HTTP_PORT: u16 = 8080;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatientListQuery {
    keyword: Option<String>,
    sort_desc: Option<bool>,
}

#[derive(Deserialize)]
struct DailyOrderQuery {
    date: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddPatientRequest {
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
    #[serde(default, alias = "created_at")]
    created_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditPatientRequest {
    patient_id: String,
    patient_type: String,
    last_name_kanji: String,
    first_name_kanji: String,
    last_name_kana: String,
    first_name_kana: String,
    birth_date: String,
    gender: String,
    height: Option<f64>,
    weight: Option<f64>,
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddExamOrderRequest {
    exam_date: String,
    exam_time: String,
    exam_item: String,
    requesting_department: String,
    requesting_physician: String,
    #[serde(default)]
    dosage_mbq: Option<f64>,
    #[serde(default)]
    dosage_ml: Option<f64>,
    #[serde(default)]
    remain_mbq: Option<f64>,
    #[serde(default)]
    remain_ml: Option<f64>,
    #[serde(default)]
    injection_time: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditExamOrderRequest {
    #[serde(default)]
    dosage_mbq: Option<f64>,
    #[serde(default)]
    dosage_ml: Option<f64>,
    #[serde(default)]
    remain_mbq: Option<f64>,
    #[serde(default)]
    remain_ml: Option<f64>,
    #[serde(default)]
    injection_time: Option<String>,
}

fn empty_ok(result: Result<(), String>) -> Response {
    match result {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "ok": true }))
}

async fn list_patients(Query(query): Query<PatientListQuery>) -> Response {
    let keyword = query
        .keyword
        .filter(|value| !value.trim().is_empty());
    let sort_desc = query.sort_desc.unwrap_or(true);
    match patient_model::search(keyword, sort_desc) {
        Ok(patients) => Json(patients).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn create_patient(Json(body): Json<AddPatientRequest>) -> Response {
    let fields = PatientFields {
        patient_id: body.patient_id,
        patient_type: body.patient_type,
        last_name_kanji: body.last_name_kanji,
        first_name_kanji: body.first_name_kanji,
        last_name_kana: body.last_name_kana,
        first_name_kana: body.first_name_kana,
        height: body.height,
        weight: body.weight,
        birth_date: body.birth_date,
        gender: body.gender,
        created_at: body.created_at,
    };
    empty_ok(patient_model::insert(&fields))
}

async fn update_patient(
    Path(id): Path<i32>,
    Json(body): Json<EditPatientRequest>,
) -> Response {
    empty_ok(patient_model::update(
        id,
        &body.patient_id,
        &body.patient_type,
        &body.last_name_kanji,
        &body.first_name_kanji,
        &body.last_name_kana,
        &body.first_name_kana,
        &body.birth_date,
        &body.gender,
        body.height,
        body.weight,
        &body.created_at,
    ))
}

async fn delete_patient(Path(id): Path<i32>) -> Response {
    empty_ok(patient_model::delete(id).map_err(|e| e.to_string()))
}

async fn list_patient_orders(Path(patient_db_id): Path<i32>) -> Response {
    match exam_order::model::get_orders_by_patient(patient_db_id) {
        Ok(orders) => Json(orders).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn create_patient_order(
    Path(patient_db_id): Path<i32>,
    Json(body): Json<AddExamOrderRequest>,
) -> Response {
    empty_ok(exam_order::model::insert_order(
        patient_db_id,
        &body.exam_date,
        &body.exam_time,
        &body.exam_item,
        &body.requesting_department,
        &body.requesting_physician,
        body.dosage_mbq,
        body.dosage_ml,
        body.remain_mbq,
        body.remain_ml,
        body.injection_time,
    ))
}

async fn daily_exam_orders(Query(query): Query<DailyOrderQuery>) -> Response {
    match exam_order::model::get_orders_by_date(&query.date) {
        Ok(orders) => Json(orders).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn update_exam_order(
    Path(id): Path<i32>,
    Json(body): Json<EditExamOrderRequest>,
) -> Response {
    empty_ok(exam_order::model::update_exam_order_specifc_fields(
        id,
        body.dosage_mbq,
        body.dosage_ml,
        body.remain_mbq,
        body.remain_ml,
        body.injection_time,
    ))
}

async fn delete_exam_order(Path(id): Path<i32>) -> Response {
    empty_ok(exam_order::model::delete_order(id))
}

async fn help_page() -> Html<&'static str> {
    Html(
        r#"<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>RC Tools API</title>
  </head>
  <body>
    <h1>RC Tools は起動しています</h1>
    <p>API: <a href="/api/health">/api/health</a></p>
    <p>画面ファイル（dist）が見つかりません。サーバー役 PC でフロントをビルドするか、Tauri ウィンドウから操作してください。</p>
  </body>
</html>"#,
    )
}

pub fn resolve_frontend_dir() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("dist"));
            candidates.push(dir.join("../dist"));
            candidates.push(dir.join("../../dist"));
            candidates.push(dir.join("../../../dist"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("dist"));
        candidates.push(cwd.join("../dist"));
    }
    candidates.into_iter().find(|path| path.join("index.html").is_file())
}

fn api_router() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/patients", get(list_patients).post(create_patient))
        .route(
            "/patients/{id}",
            axum::routing::put(update_patient).delete(delete_patient),
        )
        .route(
            "/patients/{id}/orders",
            get(list_patient_orders).post(create_patient_order),
        )
        .route("/exam-orders", get(daily_exam_orders))
        .route(
            "/exam-orders/{id}",
            patch(update_exam_order).delete(delete_exam_order),
        )
}

pub fn local_ui_url() -> String {
    format!("http://127.0.0.1:{HTTP_PORT}/")
}

async fn bind_and_serve(
    frontend_dir: Option<PathBuf>,
    ready: std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), std::io::Error> {
    let mut app = Router::new()
        .nest("/api", api_router())
        .layer(CorsLayer::permissive());

    app = if let Some(dir) = frontend_dir {
        log::info!("静的ファイル: {}", dir.display());
        app.fallback_service(ServeDir::new(dir).append_index_html_on_directories(true))
    } else {
        app.fallback(get(help_page))
    };

    let addr = SocketAddr::from(([0, 0, 0, 0], HTTP_PORT));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(error) => {
            let _ = ready.send(Err(error.to_string()));
            return Err(error);
        }
    };

    log::info!("HTTP server listening on http://0.0.0.0:{HTTP_PORT}");
    eprintln!(
        "RC Tools HTTP: {}  （他端末は http://<このPCのIP>:{HTTP_PORT}/ ）",
        local_ui_url()
    );
    let _ = ready.send(Ok(()));
    axum::serve(listener, app).await
}

/// Tauri のランタイムとは別に HTTP を起動し、待ち受け開始までブロックする。
pub fn spawn_and_wait() -> Result<(), String> {
    let frontend_dir = resolve_frontend_dir();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();

    std::thread::Builder::new()
        .name("rct-http".into())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .thread_name("rct-http-worker")
                .build()
            {
                Ok(runtime) => runtime,
                Err(error) => {
                    let _ = ready_tx.send(Err(error.to_string()));
                    return;
                }
            };

            runtime.block_on(async move {
                if let Err(error) = bind_and_serve(frontend_dir, ready_tx).await {
                    log::error!("HTTP server failed: {error}");
                    eprintln!("HTTP server failed: {error}");
                }
            });
        })
        .map_err(|error| error.to_string())?;

    ready_rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "HTTP サーバーの起動待ちがタイムアウトしました".to_string())?
}
