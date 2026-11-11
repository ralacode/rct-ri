// exe と同じ階層の videos フォルダを、ログイン中の担当者だけに配信する。

use crate::auth::{self, AuthUser};
use crate::db::{get_user_db_path, get_videos_dir};
use axum::extract::{Extension, Query, Request};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tower::ServiceExt;
use tower_http::services::ServeFile;

const ALLOWED_EXTENSIONS: &[&str] = &["mp4", "webm", "m4v"];
const COMPLETE_REMAIN_SEC: f64 = 2.0;
/// シークなしでこれより大きく戻る位置は、要素が外れたときの 0 秒とみなして捨てる。
const BACKWARD_JUMP_SEC: f64 = 1.0;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoItem {
    pub name: String,
    pub title: String,
    pub size: u64,
    pub position_sec: f64,
    pub duration_sec: f64,
    pub completed: bool,
    pub updated_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchRow {
    pub user_id: String,
    pub display_name: String,
    pub file_name: String,
    pub title: String,
    pub position_sec: f64,
    pub duration_sec: f64,
    pub percent: f64,
    pub completed: bool,
    pub updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContentQuery {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProgressRequest {
    file_name: String,
    position_sec: f64,
    duration_sec: f64,
    /// ユーザーがシークした、または完了後に最初から再生したとき true。
    /// false のとき、保存済みより大きく手前の位置では上書きしない。
    #[serde(default)]
    seeked: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveTitleRequest {
    file_name: String,
    title: String,
}

struct StoredProgress {
    position_sec: f64,
    duration_sec: f64,
    updated_at: String,
}

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS video_progress (
            user_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            position_sec REAL NOT NULL DEFAULT 0,
            duration_sec REAL NOT NULL DEFAULT 0,
            max_position_sec REAL NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, file_name),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS video_titles (
            file_name TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}

pub fn routes() -> Router {
    Router::new()
        .route("/videos", get(list_videos))
        .route("/videos/progress", get(admin_progress).put(save_progress))
        .route("/videos/title", axum::routing::put(save_title))
        .route("/videos/content", get(stream_content))
}

fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(get_user_db_path()).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(Duration::from_secs(5));
    let _ = conn.execute("PRAGMA foreign_keys = ON;", []);
    Ok(conn)
}

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn extension_ok(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ALLOWED_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains('\0')
        && !name.contains("..")
        && Path::new(name).file_name().and_then(|value| value.to_str()) == Some(name)
}

fn resolve_video_file(name: &str) -> Result<PathBuf, String> {
    if !is_safe_file_name(name) || !extension_ok(name) {
        return Err("不正なファイル名です".into());
    }
    let dir = get_videos_dir();
    let path = dir.join(name);
    let dir_canon = dir
        .canonicalize()
        .map_err(|_| "動画フォルダがありません".to_string())?;
    let path_canon = path
        .canonicalize()
        .map_err(|_| "動画が見つかりません".to_string())?;
    if !path_canon.starts_with(&dir_canon) || !path_canon.is_file() {
        return Err("動画が見つかりません".into());
    }
    Ok(path_canon)
}

fn list_files() -> Result<Vec<(String, u64)>, String> {
    let dir = get_videos_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !is_safe_file_name(name) || !extension_ok(name) {
            continue;
        }
        let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        files.push((name.to_string(), size));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(files)
}

fn is_completed(position_sec: f64, duration_sec: f64) -> bool {
    if duration_sec <= 0.0 || !duration_sec.is_finite() || !position_sec.is_finite() {
        return false;
    }
    let position = position_sec.max(0.0);
    // 終了直前で止めたものと、最後まで再生したものだけ完了にする。
    position > 0.0 && duration_sec - position <= COMPLETE_REMAIN_SEC
}

fn resolve_position(previous: Option<f64>, incoming: f64, seeked: bool) -> f64 {
    let position = if incoming.is_finite() {
        incoming.max(0.0)
    } else {
        0.0
    };
    let Some(previous) = previous.filter(|value| value.is_finite()) else {
        return position;
    };
    if !seeked && position + BACKWARD_JUMP_SEC < previous {
        return previous;
    }
    position
}

fn title_for(conn: &Connection, file_name: &str) -> Result<String, String> {
    let title: rusqlite::Result<String> = conn.query_row(
        "SELECT title FROM video_titles WHERE file_name = ?1",
        params![file_name],
        |row| row.get(0),
    );
    match title {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(file_name.to_string())
            } else {
                Ok(trimmed.to_string())
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(file_name.to_string()),
        Err(error) => Err(error.to_string()),
    }
}

fn percent(position_sec: f64, duration_sec: f64) -> f64 {
    if duration_sec <= 0.0 {
        return 0.0;
    }
    ((position_sec / duration_sec) * 100.0).clamp(0.0, 100.0)
}

fn progress_for_user(
    conn: &Connection,
    user_id: i32,
    file_name: &str,
) -> Result<Option<StoredProgress>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT position_sec, duration_sec, updated_at
             FROM video_progress
             WHERE user_id = ?1 AND file_name = ?2",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![user_id, file_name])
        .map_err(|e| e.to_string())?;
    let Some(row) = rows.next().map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    Ok(Some(StoredProgress {
        position_sec: row.get(0).map_err(|e| e.to_string())?,
        duration_sec: row.get(1).map_err(|e| e.to_string())?,
        updated_at: row.get(2).map_err(|e| e.to_string())?,
    }))
}

fn all_progress(conn: &Connection) -> Result<Vec<(i32, String, StoredProgress)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT user_id, file_name, position_sec, duration_sec, updated_at
             FROM video_progress",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, String>(1)?,
                StoredProgress {
                    position_sec: row.get(2)?,
                    duration_sec: row.get(3)?,
                    updated_at: row.get(4)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

async fn list_videos(Extension(user): Extension<AuthUser>) -> Response {
    match list_videos_for(user.id) {
        Ok(items) => Json(items).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

fn list_videos_for(user_id: i32) -> Result<Vec<VideoItem>, String> {
    let conn = open_db()?;
    let files = list_files()?;
    let mut items = Vec::new();
    for (name, size) in files {
        let progress = progress_for_user(&conn, user_id, &name)?;
        let title = title_for(&conn, &name)?;
        items.push(VideoItem {
            name,
            title,
            size,
            position_sec: progress
                .as_ref()
                .map(|item| item.position_sec)
                .unwrap_or(0.0),
            duration_sec: progress
                .as_ref()
                .map(|item| item.duration_sec)
                .unwrap_or(0.0),
            completed: progress
                .as_ref()
                .map(|item| is_completed(item.position_sec, item.duration_sec))
                .unwrap_or(false),
            updated_at: progress.map(|item| item.updated_at),
        });
    }
    Ok(items)
}

async fn stream_content(Query(query): Query<ContentQuery>, request: Request) -> Response {
    let path = match resolve_video_file(&query.name) {
        Ok(path) => path,
        Err(message) => {
            let status = if message.contains("見つかりません") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::BAD_REQUEST
            };
            return (status, message).into_response();
        }
    };
    match ServeFile::new(path).oneshot(request).await {
        Ok(response) => response.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn save_progress(
    Extension(user): Extension<AuthUser>,
    Json(body): Json<SaveProgressRequest>,
) -> Response {
    match upsert_progress(user.id, &body) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

fn upsert_progress(user_id: i32, body: &SaveProgressRequest) -> Result<(), String> {
    let _ = resolve_video_file(&body.file_name)?;
    let conn = open_db()?;
    let previous = progress_for_user(&conn, user_id, &body.file_name)?;
    let mut duration = if body.duration_sec.is_finite() && body.duration_sec > 0.0 {
        body.duration_sec
    } else {
        0.0
    };
    if duration <= 0.0 {
        if let Some(prev) = &previous {
            duration = prev.duration_sec;
        }
    }
    let mut position = resolve_position(
        previous.as_ref().map(|item| item.position_sec),
        body.position_sec,
        body.seeked,
    );
    if duration > 0.0 {
        position = position.min(duration);
    }
    let completed = is_completed(position, duration);
    let max_position = previous
        .as_ref()
        .map(|item| item.position_sec.max(position))
        .unwrap_or(position);
    conn.execute(
        "INSERT INTO video_progress (
            user_id, file_name, position_sec, duration_sec, max_position_sec, completed, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (user_id, file_name) DO UPDATE SET
            position_sec = excluded.position_sec,
            duration_sec = excluded.duration_sec,
            max_position_sec = MAX(video_progress.max_position_sec, excluded.max_position_sec),
            completed = excluded.completed,
            updated_at = excluded.updated_at",
        params![
            user_id,
            body.file_name,
            position,
            duration,
            max_position,
            if completed { 1 } else { 0 },
            now_str()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn admin_progress(Extension(actor): Extension<AuthUser>) -> Response {
    if !actor.can_manage() {
        return (
            StatusCode::FORBIDDEN,
            "視聴状況を見る権限がありません".to_string(),
        )
            .into_response();
    }
    match list_admin_progress() {
        Ok(rows) => Json(rows).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

fn list_admin_progress() -> Result<Vec<WatchRow>, String> {
    let files = list_files()?;
    let users = auth::list_users()?;
    let conn = open_db()?;
    let stored = all_progress(&conn)?;
    let mut rows = Vec::new();
    for user in users {
        for (file_name, _) in &files {
            let found = stored
                .iter()
                .find(|(id, name, _)| *id == user.id && name == file_name);
            let progress = found.map(|(_, _, item)| item);
            rows.push(WatchRow {
                user_id: user.user_id.clone(),
                display_name: user.display_name.clone(),
                file_name: file_name.clone(),
                title: title_for(&conn, file_name)?,
                position_sec: progress.map(|item| item.position_sec).unwrap_or(0.0),
                duration_sec: progress.map(|item| item.duration_sec).unwrap_or(0.0),
                percent: percent(
                    progress.map(|item| item.position_sec).unwrap_or(0.0),
                    progress.map(|item| item.duration_sec).unwrap_or(0.0),
                ),
                completed: progress
                    .map(|item| is_completed(item.position_sec, item.duration_sec))
                    .unwrap_or(false),
                updated_at: progress.map(|item| item.updated_at.clone()),
            });
        }
    }
    Ok(rows)
}

async fn save_title(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<SaveTitleRequest>,
) -> Response {
    if !actor.can_manage() {
        return (
            StatusCode::FORBIDDEN,
            "タイトルを変更する権限がありません".to_string(),
        )
            .into_response();
    }
    match upsert_title(&body.file_name, &body.title) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

fn upsert_title(file_name: &str, title: &str) -> Result<(), String> {
    let _ = resolve_video_file(file_name)?;
    let title = title.trim();
    let conn = open_db()?;
    if title.is_empty() {
        conn.execute(
            "DELETE FROM video_titles WHERE file_name = ?1",
            params![file_name],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO video_titles (file_name, title, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (file_name) DO UPDATE SET
            title = excluded.title,
            updated_at = excluded.updated_at",
        params![file_name, title, now_str()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_completed, resolve_position};

    #[test]
    fn completion_is_only_the_last_two_seconds() {
        assert!(!is_completed(0.0, 100.0));
        assert!(!is_completed(95.0, 100.0));
        assert!(!is_completed(97.9, 100.0));
        assert!(is_completed(98.0, 100.0));
        assert!(is_completed(100.0, 100.0));
        assert!(!is_completed(0.0, 1.0));
        assert!(is_completed(1.0, 1.0));
        assert!(!is_completed(10.0, 0.0));
        assert!(!is_completed(f64::NAN, 100.0));
    }

    #[test]
    fn backward_jump_without_seek_keeps_saved_position() {
        assert_eq!(resolve_position(Some(42.0), 0.0, false), 42.0);
        assert_eq!(resolve_position(Some(42.0), 41.2, false), 41.2);
        assert_eq!(resolve_position(Some(42.0), 40.0, false), 42.0);
        assert_eq!(resolve_position(Some(42.0), 50.0, false), 50.0);
        assert_eq!(resolve_position(Some(100.0), 12.0, true), 12.0);
        assert_eq!(resolve_position(None, 8.0, false), 8.0);
        assert_eq!(resolve_position(Some(f64::NAN), 3.0, false), 3.0);
    }
}
