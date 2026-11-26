// src-tauri/src/settings.rs
// アプリ全体の設定（rct_local.db の app_settings）。いまは施設名だけを持つ。
// 施設名は必須で、登録されるまでアプリは使えない（http.rs の gate_pages / require_facility）。

use crate::auth::AuthUser;
use crate::db::get_db_path;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Extension, Json, Router};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::json;

const FACILITY_NAME_KEY: &str = "facility_name";
const FACILITY_NAME_LIMIT: usize = 100;

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}

fn open() -> Result<Connection, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// 前後の空白を除き、続く空白（全角を含む）は半角1つにまとめる。空欄と長すぎる名前はエラー。
pub fn validate_facility_name(raw: &str) -> Result<String, String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err("施設名を入力してください".into());
    }
    if name.chars().count() > FACILITY_NAME_LIMIT {
        return Err(format!("施設名は{FACILITY_NAME_LIMIT}文字以内です"));
    }
    Ok(name)
}

pub fn facility_name_on(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![FACILITY_NAME_KEY],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map(|value| value.filter(|name| !name.trim().is_empty()))
    .map_err(|e| e.to_string())
}

pub fn set_facility_name_on(conn: &Connection, raw: &str) -> Result<String, String> {
    let name = validate_facility_name(raw)?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![FACILITY_NAME_KEY, name, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(name)
}

/// 登録済みの施設名。未登録なら None。
pub fn facility_name() -> Result<Option<String>, String> {
    facility_name_on(&open()?)
}

/// 施設名が未登録か。DB を読めないときは未登録として扱う（使える状態にはしない）。
pub fn needs_facility_name() -> bool {
    !matches!(facility_name(), Ok(Some(_)))
}

// ---- HTTP ----

#[derive(Deserialize)]
struct FacilityNameBody {
    name: String,
}

async fn get_facility_name() -> Response {
    match facility_name() {
        Ok(name) => Json(json!({ "name": name })).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

async fn put_facility_name(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<FacilityNameBody>,
) -> Response {
    if !actor.can_manage() {
        return (StatusCode::FORBIDDEN, "施設名を変更する権限がありません").into_response();
    }
    match open().and_then(|conn| set_facility_name_on(&conn, &body.name)) {
        Ok(name) => {
            crate::events::notify();
            Json(json!({ "name": name })).into_response()
        }
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

/// 施設名の取得はログインした人なら誰でも、変更は担当者管理権限を持つ人だけができる。
pub fn routes() -> Router {
    Router::new().route(
        "/settings/facility-name",
        get(get_facility_name).put(put_facility_name),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        conn
    }

    #[test]
    fn facility_name_starts_empty_and_can_be_set() {
        let conn = test_db();
        assert_eq!(facility_name_on(&conn).unwrap(), None);
        let saved = set_facility_name_on(&conn, "　サンプル\u{3000}病院  ").unwrap();
        assert_eq!(saved, "サンプル 病院");
        assert_eq!(
            facility_name_on(&conn).unwrap().as_deref(),
            Some("サンプル 病院")
        );
        set_facility_name_on(&conn, "別の施設").unwrap();
        assert_eq!(
            facility_name_on(&conn).unwrap().as_deref(),
            Some("別の施設")
        );
    }

    #[test]
    fn rejects_empty_or_long_names() {
        let conn = test_db();
        assert!(set_facility_name_on(&conn, " \u{3000} ").is_err());
        assert!(set_facility_name_on(&conn, &"あ".repeat(101)).is_err());
        assert!(set_facility_name_on(&conn, &"あ".repeat(100)).is_ok());
        // 失敗しても前の値は残る
        assert!(set_facility_name_on(&conn, "").is_err());
        assert_eq!(
            facility_name_on(&conn).unwrap().as_deref(),
            Some("あ".repeat(100).as_str())
        );
    }
}
