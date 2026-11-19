// RIS についての質問・要望。看護師（パスワードなし）と職員の両方が投稿・閲覧でき、
// 担当者管理で「回答できる」に指定された職員だけが回答を書ける。
// データは exe 横の feedback.db（業務データ・担当者データとは別ファイル）に置く。

use crate::auth::{self, AuthUser};
use crate::db::get_feedback_db_path;
use axum::extract::Path;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Extension, Json, Router};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAX_BODY_CHARS: usize = 2000;
const MAX_ANSWER_CHARS: usize = 4000;
const MAX_SHORT_CHARS: usize = 50;
const KINDS: &[&str] = &["question", "request", "other"];

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackItem {
    pub id: i64,
    pub kind: String,
    pub body: String,
    /// nurse / staff
    pub submitter_role: String,
    pub submitter_name: String,
    pub department: String,
    pub answer: String,
    pub answered_by: String,
    pub answered_at: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewFeedback {
    pub kind: String,
    pub body: String,
    #[serde(default)]
    pub submitter_name: String,
    #[serde(default)]
    pub department: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnswerRequest {
    answer: String,
}

/// 投稿・閲覧している人。職員のセッションがあればそちらを優先する。
enum Viewer {
    Nurse,
    Staff(AuthUser),
}

fn viewer_from_headers(headers: &HeaderMap) -> Option<Viewer> {
    if let Ok(user) = auth::user_from_headers(headers) {
        return Some(Viewer::Staff(user));
    }
    crate::http::is_nurse_mode(headers).then_some(Viewer::Nurse)
}

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            body TEXT NOT NULL,
            submitter_role TEXT NOT NULL,
            submitter_name TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            account_user_id TEXT,
            answer TEXT NOT NULL DEFAULT '',
            answered_by TEXT NOT NULL DEFAULT '',
            answered_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}

fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(get_feedback_db_path()).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(Duration::from_secs(5));
    Ok(conn)
}

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn short_text(raw: &str, label: &str) -> Result<String, String> {
    let value = raw.trim().to_string();
    if value.chars().count() > MAX_SHORT_CHARS {
        return Err(format!(
            "{label}は{MAX_SHORT_CHARS}文字以内で入力してください"
        ));
    }
    Ok(value)
}

fn map_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<FeedbackItem> {
    Ok(FeedbackItem {
        id: row.get(0)?,
        kind: row.get(1)?,
        body: row.get(2)?,
        submitter_role: row.get(3)?,
        submitter_name: row.get(4)?,
        department: row.get(5)?,
        answer: row.get(6)?,
        answered_by: row.get(7)?,
        answered_at: row.get(8)?,
        created_at: row.get(9)?,
    })
}

const ITEM_COLUMNS: &str = "id, kind, body, submitter_role, submitter_name, department, \
     answer, answered_by, answered_at, created_at";

pub fn list(conn: &Connection) -> Result<Vec<FeedbackItem>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ITEM_COLUMNS} FROM feedback ORDER BY created_at DESC, id DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_item).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn find(conn: &Connection, id: i64) -> Result<FeedbackItem, String> {
    conn.query_row(
        &format!("SELECT {ITEM_COLUMNS} FROM feedback WHERE id = ?1"),
        params![id],
        map_item,
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => "投稿が見つかりません".to_string(),
        other => other.to_string(),
    })
}

/// 投稿を保存する。職員が投稿したときは、名前が空ならアカウント名を入れる。
pub fn insert(
    conn: &Connection,
    input: &NewFeedback,
    staff: Option<&AuthUser>,
) -> Result<FeedbackItem, String> {
    let kind = input.kind.trim();
    if !KINDS.contains(&kind) {
        return Err("種別を選んでください".into());
    }
    let body = input.body.trim();
    if body.is_empty() {
        return Err("内容を入力してください".into());
    }
    if body.chars().count() > MAX_BODY_CHARS {
        return Err(format!("内容は{MAX_BODY_CHARS}文字以内で入力してください"));
    }
    let mut submitter_name = short_text(&input.submitter_name, "名前")?;
    let department = short_text(&input.department, "所属")?;
    if submitter_name.is_empty() {
        if let Some(user) = staff {
            submitter_name = user.display_name.clone();
        }
    }
    let role = if staff.is_some() { "staff" } else { "nurse" };
    let now = now_str();
    conn.execute(
        "INSERT INTO feedback (
            kind, body, submitter_role, submitter_name, department,
            account_user_id, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            kind,
            body,
            role,
            submitter_name,
            department,
            staff.map(|user| user.user_id.clone()),
            now
        ],
    )
    .map_err(|e| e.to_string())?;
    find(conn, conn.last_insert_rowid())
}

/// 回答を書く（空にすると回答を取り消す）。
pub fn answer(
    conn: &Connection,
    id: i64,
    text: &str,
    responder: &AuthUser,
) -> Result<FeedbackItem, String> {
    let text = text.trim();
    if text.chars().count() > MAX_ANSWER_CHARS {
        return Err(format!(
            "回答は{MAX_ANSWER_CHARS}文字以内で入力してください"
        ));
    }
    let now = now_str();
    let (answered_by, answered_at) = if text.is_empty() {
        (String::new(), None)
    } else {
        (responder.display_name.clone(), Some(now.clone()))
    };
    let updated = conn
        .execute(
            "UPDATE feedback
             SET answer = ?1, answered_by = ?2, answered_at = ?3, updated_at = ?4
             WHERE id = ?5",
            params![text, answered_by, answered_at, now, id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("投稿が見つかりません".into());
    }
    find(conn, id)
}

fn fail(status: StatusCode, message: String) -> Response {
    (status, message).into_response()
}

fn forbidden_viewer() -> Response {
    fail(
        StatusCode::UNAUTHORIZED,
        "ログイン画面から入り直してください".into(),
    )
}

async fn list_handler(headers: HeaderMap) -> Response {
    if viewer_from_headers(&headers).is_none() {
        return forbidden_viewer();
    }
    match open_db().and_then(|conn| list(&conn)) {
        Ok(items) => Json(items).into_response(),
        Err(message) => fail(StatusCode::INTERNAL_SERVER_ERROR, message),
    }
}

async fn create_handler(headers: HeaderMap, Json(body): Json<NewFeedback>) -> Response {
    let staff = match viewer_from_headers(&headers) {
        Some(Viewer::Staff(user)) => Some(user),
        Some(Viewer::Nurse) => None,
        None => return forbidden_viewer(),
    };
    match open_db().and_then(|conn| insert(&conn, &body, staff.as_ref())) {
        Ok(item) => {
            crate::events::notify();
            Json(item).into_response()
        }
        Err(message) => fail(StatusCode::BAD_REQUEST, message),
    }
}

async fn answer_handler(
    Path(id): Path<i64>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<AnswerRequest>,
) -> Response {
    if !actor.can_answer_feedback {
        return fail(
            StatusCode::FORBIDDEN,
            "回答できるのは担当者管理で指定された人だけです".into(),
        );
    }
    match open_db().and_then(|conn| answer(&conn, id, &body.answer, &actor)) {
        Ok(item) => {
            crate::events::notify();
            Json(item).into_response()
        }
        Err(message) => fail(StatusCode::BAD_REQUEST, message),
    }
}

/// 看護師モードでも使う API（ハンドラ内で看護師 Cookie か職員セッションを確認する）。
pub fn public_routes() -> Router {
    Router::new().route("/feedback", get(list_handler).post(create_handler))
}

/// 職員のログインが必要な API。
pub fn protected_routes() -> Router {
    Router::new().route("/feedback/{id}/answer", put(answer_handler))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        conn
    }

    fn staff(can_answer: bool) -> AuthUser {
        AuthUser {
            id: 1,
            user_id: "00000001".into(),
            last_name: "山田".into(),
            first_name: "太郎".into(),
            display_name: "山田 太郎".into(),
            is_initial_admin: false,
            can_manage_users: false,
            can_answer_feedback: can_answer,
            modalities: Vec::new(),
        }
    }

    fn input(kind: &str, body: &str, name: &str) -> NewFeedback {
        NewFeedback {
            kind: kind.into(),
            body: body.into(),
            submitter_name: name.into(),
            department: String::new(),
        }
    }

    #[test]
    fn nurse_post_is_anonymous_unless_named() {
        let conn = conn();
        let item = insert(&conn, &input("question", "  検査予約の見方は？ ", ""), None).unwrap();
        assert_eq!(item.submitter_role, "nurse");
        assert_eq!(item.submitter_name, "");
        assert_eq!(item.body, "検査予約の見方は？");
    }

    #[test]
    fn staff_post_uses_account_name_by_default() {
        let conn = conn();
        let item = insert(
            &conn,
            &input("request", "一覧を印刷したい", ""),
            Some(&staff(false)),
        )
        .unwrap();
        assert_eq!(item.submitter_role, "staff");
        assert_eq!(item.submitter_name, "山田 太郎");
    }

    #[test]
    fn rejects_invalid_input() {
        let conn = conn();
        assert!(insert(&conn, &input("question", "   ", ""), None).is_err());
        assert!(insert(&conn, &input("unknown", "内容", ""), None).is_err());
        let long = "あ".repeat(MAX_BODY_CHARS + 1);
        assert!(insert(&conn, &input("other", &long, ""), None).is_err());
        let long_name = "あ".repeat(MAX_SHORT_CHARS + 1);
        assert!(insert(&conn, &input("other", "内容", &long_name), None).is_err());
    }

    #[test]
    fn answer_and_clear() {
        let conn = conn();
        let item = insert(&conn, &input("question", "質問", ""), None).unwrap();
        let answered = answer(&conn, item.id, " こうします ", &staff(true)).unwrap();
        assert_eq!(answered.answer, "こうします");
        assert_eq!(answered.answered_by, "山田 太郎");
        assert!(answered.answered_at.is_some());
        let cleared = answer(&conn, item.id, "", &staff(true)).unwrap();
        assert_eq!(cleared.answer, "");
        assert_eq!(cleared.answered_by, "");
        assert!(cleared.answered_at.is_none());
        assert!(answer(&conn, 999, "x", &staff(true)).is_err());
    }

    #[test]
    fn list_is_newest_first() {
        let conn = conn();
        let first = insert(&conn, &input("question", "1件目", ""), None).unwrap();
        let second = insert(&conn, &input("question", "2件目", ""), None).unwrap();
        let ids: Vec<i64> = list(&conn).unwrap().iter().map(|item| item.id).collect();
        assert_eq!(ids, vec![second.id, first.id]);
    }
}
