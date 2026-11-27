//! 作業報告書（メーカーの保守・修理の報告）。ログインした人なら誰でも見て、登録・修正できる。

pub mod import;
pub mod model;
pub mod pdf;

use crate::auth::AuthUser;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, Query};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Extension, Json, Router};
use model::{DeviceInput, EngineerInput, NewFile, ReportFilter, ReportInput};
use serde::Deserialize;

/// 添付・取り込みできるファイルの大きさ（スマホの写真を考えて大きめにする）
const MAX_UPLOAD: usize = 30 * 1024 * 1024;

#[derive(Deserialize)]
struct FileNameQuery {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize)]
struct DownloadQuery {
    /// 1 なら、ブラウザで開かずにファイルとして保存させる
    #[serde(default)]
    download: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManufacturerBody {
    name: String,
    #[serde(default)]
    aliases: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StaffAliasBody {
    user_id: i64,
    alias: String,
}

pub fn routes() -> Router {
    Router::new()
        .route("/work-reports", get(list_reports).post(create_report))
        .route("/work-reports/options", get(options))
        .route("/work-reports/duplicate", get(check_duplicate))
        .route(
            "/work-reports/{id}",
            get(get_report).put(update_report).delete(delete_report),
        )
        .route("/work-reports/{id}/files", post(add_file))
        .route(
            "/work-report-files/{id}",
            get(download_file).delete(delete_file),
        )
        .route("/work-report-imports", post(import))
        .route("/work-report-manufacturers", post(create_manufacturer))
        .route(
            "/work-report-manufacturers/{id}",
            put(update_manufacturer).delete(delete_manufacturer),
        )
        .route("/work-report-devices", post(create_device))
        .route(
            "/work-report-devices/{id}",
            put(update_device).delete(delete_device),
        )
        .route("/work-report-engineers", post(create_engineer))
        .route(
            "/work-report-engineers/{id}",
            put(update_engineer).delete(delete_engineer),
        )
        .route("/work-report-staff-aliases", post(add_staff_alias))
        .route(
            "/work-report-staff-aliases/{id}",
            delete(delete_staff_alias),
        )
        .layer(DefaultBodyLimit::max(MAX_UPLOAD))
}

fn bad(message: String) -> Response {
    (StatusCode::BAD_REQUEST, message).into_response()
}

fn json_or_bad<T: serde::Serialize>(result: Result<T, String>) -> Response {
    match result {
        Ok(value) => Json(value).into_response(),
        Err(message) => bad(message),
    }
}

/// 変更を保存し、ほかの端末に知らせる。
fn changed<T: serde::Serialize>(result: Result<T, String>) -> Response {
    match result {
        Ok(value) => {
            crate::events::notify();
            Json(value).into_response()
        }
        Err(message) => bad(message),
    }
}

fn with_db<T>(f: impl FnOnce(&mut rusqlite::Connection) -> Result<T, String>) -> Result<T, String> {
    let mut conn = model::open_db()?;
    f(&mut conn)
}

async fn options() -> Response {
    json_or_bad((|| {
        let staff = import::staff_candidates()?;
        let modalities = crate::auth::list_modalities()?;
        with_db(|conn| {
            Ok(serde_json::json!({
                "manufacturers": model::list_manufacturers(conn)?,
                "devices": model::list_devices(conn)?,
                "engineers": model::list_engineers(conn)?,
                "staff": staff.iter().map(|p| serde_json::json!({
                    "id": p.id,
                    "name": p.display_name(),
                })).collect::<Vec<_>>(),
                "staffAliases": model::list_staff_aliases(conn)?,
                "modalities": modalities,
            }))
        })
    })())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DuplicateQuery {
    exclude_id: Option<i64>,
    #[serde(default)]
    work_order_no: String,
    device_id: Option<i64>,
    #[serde(default)]
    failure_at: String,
    #[serde(default)]
    arrival_at: String,
}

/// 入力中の報告書が登録済みか調べる（保存する前に画面で知らせるため）。
async fn check_duplicate(Query(query): Query<DuplicateQuery>) -> Response {
    let datetime = |raw: &str| model::normalize_datetime(raw, "").unwrap_or_default();
    json_or_bad(with_db(|conn| {
        Ok(model::find_duplicate(
            conn,
            query.exclude_id,
            &query.work_order_no,
            query.device_id,
            &datetime(&query.failure_at),
            &datetime(&query.arrival_at),
        )?
        .map(|duplicate| {
            serde_json::json!({
                "id": duplicate.id,
                "message": duplicate.message(),
            })
        }))
    }))
}

async fn list_reports(Query(filter): Query<ReportFilter>) -> Response {
    json_or_bad(with_db(|conn| model::list_reports(conn, &filter)))
}

async fn get_report(Path(id): Path<i64>) -> Response {
    json_or_bad(with_db(|conn| model::get_report(conn, id)))
}

async fn create_report(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ReportInput>,
) -> Response {
    changed((|| {
        let staff = import::staff_candidates()?;
        let id = with_db(|conn| model::create_report(conn, &body, &staff, &actor.display_name))?;
        Ok(serde_json::json!({ "id": id }))
    })())
}

async fn update_report(
    Path(id): Path<i64>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ReportInput>,
) -> Response {
    changed((|| {
        let staff = import::staff_candidates()?;
        with_db(|conn| model::update_report(conn, id, &body, &staff, &actor.display_name))?;
        Ok(serde_json::json!({ "id": id }))
    })())
}

async fn delete_report(Path(id): Path<i64>) -> Response {
    changed(with_db(|conn| model::delete_report(conn, id)))
}

async fn add_file(
    Path(id): Path<i64>,
    Query(query): Query<FileNameQuery>,
    body: Bytes,
) -> Response {
    changed(with_db(|conn| {
        model::add_file(
            conn,
            id,
            &NewFile {
                name: query.name,
                bytes: body.to_vec(),
            },
        )
    }))
}

/// `filename*` 用に、ファイル名をパーセントエンコードする。
fn encode_file_name(name: &str) -> String {
    name.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// 添付ファイルを返す。`?download=1` なら保存用（attachment）、なければブラウザで表示する（inline）。
async fn download_file(Path(id): Path<i64>, Query(query): Query<DownloadQuery>) -> Response {
    let disposition = if query.download.as_deref() == Some("1") {
        "attachment"
    } else {
        "inline"
    };
    match with_db(|conn| model::get_file(conn, id)) {
        Ok((file, bytes)) => (
            [
                (header::CONTENT_TYPE, file.content_type.clone()),
                (
                    header::CONTENT_DISPOSITION,
                    format!(
                        "{disposition}; filename*=UTF-8''{}",
                        encode_file_name(&file.file_name)
                    ),
                ),
                (header::CACHE_CONTROL, "private, max-age=3600".to_string()),
            ],
            bytes,
        )
            .into_response(),
        Err(message) => (StatusCode::NOT_FOUND, message).into_response(),
    }
}

async fn delete_file(Path(id): Path<i64>) -> Response {
    changed(with_db(|conn| model::delete_file(conn, id)))
}

async fn import(
    Extension(actor): Extension<AuthUser>,
    Query(query): Query<FileNameQuery>,
    body: Bytes,
) -> Response {
    let file = NewFile {
        name: query.name,
        bytes: body.to_vec(),
    };
    // PDF の読み取りは時間がかかることがあるので、別のスレッドで行う。
    let result =
        tokio::task::spawn_blocking(move || import::import_files(vec![file], &actor.display_name))
            .await
            .unwrap_or_else(|_| Err("取り込み中にエラーが起きました".into()));
    json_or_bad(result)
}

async fn create_manufacturer(Json(body): Json<ManufacturerBody>) -> Response {
    changed(with_db(|conn| {
        model::save_manufacturer(conn, None, &body.name, &body.aliases)
    }))
}

async fn update_manufacturer(Path(id): Path<i64>, Json(body): Json<ManufacturerBody>) -> Response {
    changed(with_db(|conn| {
        model::save_manufacturer(conn, Some(id), &body.name, &body.aliases)
    }))
}

async fn delete_manufacturer(Path(id): Path<i64>) -> Response {
    changed(with_db(|conn| model::delete_manufacturer(conn, id)))
}

async fn create_device(Json(body): Json<DeviceInput>) -> Response {
    changed(with_db(|conn| model::save_device(conn, None, &body)))
}

async fn update_device(Path(id): Path<i64>, Json(body): Json<DeviceInput>) -> Response {
    changed(with_db(|conn| model::save_device(conn, Some(id), &body)))
}

async fn delete_device(Path(id): Path<i64>) -> Response {
    changed(with_db(|conn| model::delete_device(conn, id)))
}

async fn create_engineer(Json(body): Json<EngineerInput>) -> Response {
    changed(with_db(|conn| model::save_engineer(conn, None, &body)))
}

async fn update_engineer(Path(id): Path<i64>, Json(body): Json<EngineerInput>) -> Response {
    changed(with_db(|conn| model::save_engineer(conn, Some(id), &body)))
}

async fn delete_engineer(Path(id): Path<i64>) -> Response {
    changed(with_db(|conn| model::delete_engineer(conn, id)))
}

async fn add_staff_alias(Json(body): Json<StaffAliasBody>) -> Response {
    changed(with_db(|conn| {
        model::add_staff_alias(conn, body.user_id, &body.alias)
    }))
}

async fn delete_staff_alias(Path(id): Path<i64>) -> Response {
    changed(with_db(|conn| model::delete_staff_alias(conn, id)))
}
