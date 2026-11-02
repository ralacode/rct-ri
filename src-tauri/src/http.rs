// src-tauri/src/http.rs
// 院内 LAN 向け HTTP API。担当者セッション（Cookie）で保護する。

use crate::auth::{self, AuthUser};
use crate::exam_order;
use crate::patient::model::{self as patient_model, PatientFields};
use axum::extract::{Path, Query, Request};
use axum::http::{header, HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Extension, Json, Router};
use std::convert::Infallible;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt as _;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthLoginRequest {
    user_id: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthUserWriteRequest {
    user_id: String,
    password: String,
    last_name: String,
    first_name: String,
    #[serde(default)]
    modality_ids: Vec<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModalityNameRequest {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserModalitiesRequest {
    modality_ids: Vec<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordRequest {
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagePermissionRequest {
    can_manage_users: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplaceExamOrderRequest {
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

fn empty_ok(result: Result<(), String>) -> Response {
    match result {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "ok": true }))
}

fn with_session_cookie(mut response: Response, token: &str) -> Response {
    if let Ok(value) = HeaderValue::from_str(&auth::session_cookie(token)) {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

fn clear_session(mut response: Response) -> Response {
    if let Ok(value) = HeaderValue::from_str(&auth::clear_session_cookie()) {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

fn redirect_to(path: &str) -> Response {
    (StatusCode::SEE_OTHER, [(header::LOCATION, path)]).into_response()
}

fn auth_fail(status: StatusCode, message: String) -> Response {
    (status, message).into_response()
}

async fn auth_status(headers: axum::http::HeaderMap) -> Json<serde_json::Value> {
    let needs_setup = auth::user_count().unwrap_or(0) == 0;
    match auth::user_from_headers(&headers) {
        Ok(user) => Json(json!({
            "needsSetup": false,
            "authenticated": true,
            "user": user,
        })),
        Err(_) => Json(json!({
            "needsSetup": needs_setup,
            "authenticated": false,
            "user": null,
        })),
    }
}

async fn auth_setup(Json(body): Json<AuthUserWriteRequest>) -> Response {
    match auth::setup_first_admin(
        &body.user_id,
        &body.password,
        &body.last_name,
        &body.first_name,
        &body.modality_ids,
    ) {
        Ok((user, token)) => with_session_cookie(Json(user).into_response(), &token),
        Err(message) => {
            let status = if message.contains("すでに") {
                StatusCode::CONFLICT
            } else {
                StatusCode::BAD_REQUEST
            };
            auth_fail(status, message)
        }
    }
}

async fn auth_login(Json(body): Json<AuthLoginRequest>) -> Response {
    match auth::login(&body.user_id, &body.password) {
        Ok((user, token)) => with_session_cookie(Json(user).into_response(), &token),
        Err(message) => {
            let status = if message.contains("正しくありません") {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::BAD_REQUEST
            };
            auth_fail(status, message)
        }
    }
}

async fn auth_logout(headers: axum::http::HeaderMap) -> Response {
    auth::logout(auth::token_from_headers(&headers).as_deref());
    clear_session(StatusCode::NO_CONTENT.into_response())
}

async fn auth_me(Extension(user): Extension<AuthUser>) -> Json<AuthUser> {
    Json(user)
}

async fn public_modalities() -> Response {
    match auth::list_modalities() {
        Ok(modalities) => Json(modalities).into_response(),
        Err(message) => auth_fail(StatusCode::BAD_REQUEST, message),
    }
}

async fn list_modalities() -> Response {
    public_modalities().await
}

async fn create_modality(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ModalityNameRequest>,
) -> Response {
    if !actor.is_initial_admin {
        return auth_fail(
            StatusCode::FORBIDDEN,
            "初期管理者だけがモダリティを追加できます".into(),
        );
    }
    match auth::create_modality(&body.name) {
        Ok(modality) => Json(modality).into_response(),
        Err(message) => auth_fail(StatusCode::BAD_REQUEST, message),
    }
}

async fn rename_modality(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ModalityNameRequest>,
) -> Response {
    if !actor.is_initial_admin {
        return auth_fail(
            StatusCode::FORBIDDEN,
            "初期管理者だけがモダリティを変更できます".into(),
        );
    }
    empty_ok(auth::rename_modality(id, &body.name))
}

async fn delete_modality(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
) -> Response {
    if !actor.is_initial_admin {
        return auth_fail(
            StatusCode::FORBIDDEN,
            "初期管理者だけがモダリティを削除できます".into(),
        );
    }
    empty_ok(auth::delete_modality(id))
}

async fn set_user_modalities(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<UserModalitiesRequest>,
) -> Response {
    if let Some(response) = forbid_unless_manager(&actor) {
        return response;
    }
    match auth::set_user_modalities(id, &body.modality_ids) {
        Ok(user) => Json(user).into_response(),
        Err(message) => auth_fail(StatusCode::BAD_REQUEST, message),
    }
}

fn forbid_unless_manager(user: &AuthUser) -> Option<Response> {
    if user.can_manage() {
        None
    } else {
        Some(auth_fail(
            StatusCode::FORBIDDEN,
            "ユーザーを管理する権限がありません".into(),
        ))
    }
}

async fn list_users(Extension(actor): Extension<AuthUser>) -> Response {
    if let Some(response) = forbid_unless_manager(&actor) {
        return response;
    }
    match auth::list_users() {
        Ok(users) => Json(users).into_response(),
        Err(message) => auth_fail(StatusCode::BAD_REQUEST, message),
    }
}

async fn create_user(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<AuthUserWriteRequest>,
) -> Response {
    if let Some(response) = forbid_unless_manager(&actor) {
        return response;
    }
    match auth::create_user(
        &body.user_id,
        &body.password,
        &body.last_name,
        &body.first_name,
        &body.modality_ids,
    ) {
        Ok(user) => Json(user).into_response(),
        Err(message) => auth_fail(StatusCode::BAD_REQUEST, message),
    }
}

async fn delete_user(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
) -> Response {
    if let Some(response) = forbid_unless_manager(&actor) {
        return response;
    }
    if id == actor.id {
        return auth_fail(StatusCode::BAD_REQUEST, "自分自身は削除できません".into());
    }
    empty_ok(auth::delete_user(id))
}

async fn reset_user_password(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ChangePasswordRequest>,
) -> Response {
    if let Some(response) = forbid_unless_manager(&actor) {
        return response;
    }
    if id == actor.id {
        return auth_fail(
            StatusCode::BAD_REQUEST,
            "自分のパスワードはアカウント画面から変更してください".into(),
        );
    }
    empty_ok(auth::change_password(id, &body.password))
}

async fn change_own_password(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ChangePasswordRequest>,
) -> Response {
    empty_ok(auth::change_password(actor.id, &body.password))
}

async fn set_manage_permission(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ManagePermissionRequest>,
) -> Response {
    if !actor.is_initial_admin {
        return auth_fail(
            StatusCode::FORBIDDEN,
            "初期管理者だけがユーザー管理権限を変更できます".into(),
        );
    }
    empty_ok(auth::set_manage_users(id, body.can_manage_users))
}

async fn require_auth(mut request: Request, next: Next) -> Response {
    match auth::user_from_headers(request.headers()) {
        Ok(user) => {
            request.extensions_mut().insert(user);
            next.run(request).await
        }
        Err(message) => auth_fail(StatusCode::UNAUTHORIZED, message),
    }
}

async fn gate_pages(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_string();
    if path.starts_with("/api")
        || path.starts_with("/_astro")
        || path.starts_with("/favicon")
        || std::path::Path::new(&path).extension().is_some()
    {
        return next.run(request).await;
    }

    let needs_setup = auth::user_count().unwrap_or(0) == 0;
    let authenticated = auth::user_from_headers(request.headers()).is_ok();

    if path.starts_with("/setup") {
        if needs_setup {
            return next.run(request).await;
        }
        return redirect_to(if authenticated { "/" } else { "/login/" });
    }

    if path.starts_with("/login") {
        if needs_setup {
            return redirect_to("/setup/");
        }
        if authenticated {
            return redirect_to("/");
        }
        return next.run(request).await;
    }

    if needs_setup {
        return redirect_to("/setup/");
    }
    if !authenticated {
        return redirect_to("/login/");
    }
    if path.starts_with("/users") {
        if let Ok(user) = auth::user_from_headers(request.headers()) {
            if !user.can_manage() {
                return redirect_to("/account/");
            }
        }
    }
    next.run(request).await
}

async fn events() -> Response {
    let live = BroadcastStream::new(crate::events::subscribe()).filter_map(|message| {
        match message {
            Ok(_) => Some(Ok(
                Event::default().event("data-changed").data("changed")
            )),
            Err(_) => None,
        }
    });
    // 接続直後に1件送ってヘッダを確定させ、EventSource が CONNECTING のまま固まらないようにする
    let stream = tokio_stream::once(Ok::<Event, Infallible>(
        Event::default().event("hello").data("ok"),
    ))
    .chain(live);

    let mut response = Sse::new(stream)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("ping"),
        )
        .into_response();

    let headers = response.headers_mut();
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-cache, no-transform"),
    );
    headers.insert(
        HeaderName::from_static("x-accel-buffering"),
        HeaderValue::from_static("no"),
    );
    response
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

async fn replace_exam_order(
    Path(id): Path<i32>,
    Json(body): Json<ReplaceExamOrderRequest>,
) -> Response {
    empty_ok(exam_order::model::update_order(
        id,
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

fn public_api() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/auth/status", get(auth_status))
        .route("/auth/setup", post(auth_setup))
        .route("/auth/login", post(auth_login))
        .route("/auth/logout", post(auth_logout))
        .route("/auth/modalities", get(public_modalities))
}

fn protected_api() -> Router {
    Router::new()
        .route("/auth/me", get(auth_me))
        .route("/auth/password", put(change_own_password))
        .route("/users", get(list_users).post(create_user))
        .route("/users/{id}", axum::routing::delete(delete_user))
        .route("/users/{id}/password", put(reset_user_password))
        .route("/users/{id}/manage-permission", put(set_manage_permission))
        .route("/users/{id}/modalities", put(set_user_modalities))
        .route("/modalities", get(list_modalities).post(create_modality))
        .route(
            "/modalities/{id}",
            put(rename_modality).delete(delete_modality),
        )
        .route("/events", get(events))
        .route("/events/", get(events))
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
            put(replace_exam_order)
                .patch(update_exam_order)
                .delete(delete_exam_order),
        )
        .layer(middleware::from_fn(require_auth))
}

fn api_router() -> Router {
    public_api().merge(protected_api())
}

pub fn local_ui_url() -> String {
    format!("http://127.0.0.1:{HTTP_PORT}/")
}

async fn bind_and_serve(
    frontend_dir: Option<PathBuf>,
    ready: std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), std::io::Error> {
    let mut app = Router::new().nest("/api", api_router());

    app = if let Some(dir) = frontend_dir {
        log::info!("静的ファイル: {}", dir.display());
        app.fallback_service(ServeDir::new(dir).append_index_html_on_directories(true))
    } else {
        app.fallback(get(help_page))
    };

    app = app
        .layer(middleware::from_fn(gate_pages))
        .layer(CorsLayer::permissive());

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
