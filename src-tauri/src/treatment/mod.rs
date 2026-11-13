pub mod model;

use crate::auth::{self, AuthUser};
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Extension, Json, Router};
use serde::Deserialize;

#[derive(Deserialize)]
struct MonthQuery {
    month: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestBody {
    request_date: String,
    slot_time: String,
    requesting_department: String,
    requesting_physician: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClosureBody {
    closure_date: String,
    slot_time: String,
}

#[derive(Deserialize)]
struct RemarkBody {
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduleBody {
    open_weekdays: Vec<i32>,
}

pub fn routes() -> Router {
    Router::new()
        .route("/treatment-board", get(board))
        .route("/treatment-schedule", get(schedule).put(update_schedule))
        .route("/treatment-closures", post(close_slot))
        .route("/treatment-closures/{id}", axum::routing::delete(open_slot))
        .route("/treatment-remarks/{date}", put(save_remark))
        .route(
            "/treatment-requests/{id}",
            put(update_request).delete(delete_request),
        )
        .route(
            "/patients/{id}/treatment-requests",
            get(list_patient_requests).post(create_request),
        )
}

fn forbid_unless_editor(actor: &AuthUser) -> Option<Response> {
    if auth::can_edit_treatment(actor) {
        None
    } else {
        Some(
            (
                StatusCode::FORBIDDEN,
                "放射線治療の担当者だけが変更できます",
            )
                .into_response(),
        )
    }
}

fn bad(message: String) -> Response {
    (StatusCode::BAD_REQUEST, message).into_response()
}

async fn board(Extension(actor): Extension<AuthUser>, Query(query): Query<MonthQuery>) -> Response {
    match model::board(&query.month) {
        Ok(board) => {
            let can_edit = auth::can_edit_treatment(&actor);
            Json(serde_json::json!({
                "month": board.month,
                "openWeekdays": board.open_weekdays,
                "slots": board.slots,
                "canEdit": can_edit,
                "requests": board.requests,
                "closures": board.closures,
                "remarks": board.remarks,
            }))
            .into_response()
        }
        Err(message) => bad(message),
    }
}

async fn schedule() -> Response {
    match model::open_weekdays() {
        Ok(open_weekdays) => {
            Json(serde_json::json!({ "openWeekdays": open_weekdays })).into_response()
        }
        Err(message) => bad(message),
    }
}

async fn update_schedule(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ScheduleBody>,
) -> Response {
    if let Some(response) = forbid_unless_editor(&actor) {
        return response;
    }
    match model::set_open_weekdays(&body.open_weekdays) {
        Ok(open_weekdays) => {
            Json(serde_json::json!({ "openWeekdays": open_weekdays })).into_response()
        }
        Err(message) => bad(message),
    }
}

async fn list_patient_requests(Path(patient_db_id): Path<i32>) -> Response {
    match model::list_for_patient(patient_db_id) {
        Ok(requests) => Json(requests).into_response(),
        Err(message) => bad(message),
    }
}

async fn create_request(
    Path(patient_db_id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<RequestBody>,
) -> Response {
    if let Some(response) = forbid_unless_editor(&actor) {
        return response;
    }
    match model::create_request(
        patient_db_id,
        &body.request_date,
        &body.slot_time,
        &body.requesting_department,
        &body.requesting_physician,
    ) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => bad(message),
    }
}

async fn update_request(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<RequestBody>,
) -> Response {
    if let Some(response) = forbid_unless_editor(&actor) {
        return response;
    }
    match model::update_request(
        id,
        &body.request_date,
        &body.slot_time,
        &body.requesting_department,
        &body.requesting_physician,
    ) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => bad(message),
    }
}

async fn delete_request(Path(id): Path<i32>, Extension(actor): Extension<AuthUser>) -> Response {
    if let Some(response) = forbid_unless_editor(&actor) {
        return response;
    }
    match model::delete_request(id) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => bad(message),
    }
}

async fn close_slot(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<ClosureBody>,
) -> Response {
    if let Some(response) = forbid_unless_editor(&actor) {
        return response;
    }
    match model::close_slot(&body.closure_date, &body.slot_time) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => bad(message),
    }
}

async fn open_slot(Path(id): Path<i32>, Extension(actor): Extension<AuthUser>) -> Response {
    if let Some(response) = forbid_unless_editor(&actor) {
        return response;
    }
    match model::open_slot(id) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => bad(message),
    }
}

async fn save_remark(
    Path(date): Path<String>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<RemarkBody>,
) -> Response {
    if let Some(response) = forbid_unless_editor(&actor) {
        return response;
    }
    match model::save_remark(&date, &body.body) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => bad(message),
    }
}
