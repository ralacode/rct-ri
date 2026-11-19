// RIS についての質問・要望。ログインした職員（看護師を含む）が投稿・閲覧でき、
// 担当者管理で「回答できる」に指定された人だけが回答を書ける。
// データは exe 横の feedback.db（業務データ・担当者データとは別ファイル）に置く。

use crate::auth::AuthUser;
use crate::db::get_feedback_db_path;
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, put};
use axum::{Extension, Json, Router};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAX_BODY_CHARS: usize = 2000;
const MAX_ANSWER_CHARS: usize = 4000;
const KINDS: &[&str] = &["question", "request", "other"];

/// 画面に返す投稿。投稿者のアカウントは返さず、見ている人から見た可否だけを付ける。
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackItem {
    pub id: i64,
    pub kind: String,
    pub body: String,
    /// 匿名の投稿では空
    pub author_name: String,
    pub anonymous: bool,
    pub answer: String,
    pub answered_by: String,
    pub answered_at: Option<String>,
    pub created_at: String,
    /// 見ている人が投稿した
    pub is_mine: bool,
    /// 見ている人が削除できる
    pub can_delete: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewFeedback {
    pub kind: String,
    pub body: String,
    #[serde(default)]
    pub anonymous: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnswerRequest {
    answer: String,
}

struct StoredItem {
    id: i64,
    kind: String,
    body: String,
    author_id: Option<i32>,
    author_name: String,
    anonymous: bool,
    answer: String,
    answered_by: String,
    answered_at: Option<String>,
    created_at: String,
}

impl StoredItem {
    fn is_mine(&self, viewer: &AuthUser) -> bool {
        self.author_id == Some(viewer.id)
    }

    /// 本人は回答が付く前だけ、管理者はいつでも削除できる。
    fn can_delete(&self, viewer: &AuthUser) -> bool {
        viewer.can_manage() || (self.is_mine(viewer) && self.answer.is_empty())
    }

    fn view(self, viewer: &AuthUser) -> FeedbackItem {
        let is_mine = self.is_mine(viewer);
        let can_delete = self.can_delete(viewer);
        FeedbackItem {
            id: self.id,
            kind: self.kind,
            body: self.body,
            author_name: if self.anonymous {
                String::new()
            } else {
                self.author_name
            },
            anonymous: self.anonymous,
            answer: self.answer,
            answered_by: self.answered_by,
            answered_at: self.answered_at,
            created_at: self.created_at,
            is_mine,
            can_delete,
        }
    }
}

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    migrate_from_nurse_mode(conn)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            body TEXT NOT NULL,
            author_id INTEGER,
            author_name TEXT NOT NULL DEFAULT '',
            anonymous INTEGER NOT NULL DEFAULT 0,
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

/// 看護師モード（パスワードなし）時代の表（所属・投稿者区分あり）を、今の形へ移す。
/// 投稿者のアカウントは分からないので author_id は空（管理者だけが削除できる）。
/// 名前が空だった投稿は匿名として扱う。
fn migrate_from_nurse_mode(conn: &Connection) -> rusqlite::Result<()> {
    let has_old_column: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('feedback') WHERE name = 'submitter_role'",
        [],
        |row| row.get(0),
    )?;
    if has_old_column == 0 {
        return Ok(());
    }
    conn.execute_batch(
        "BEGIN;
         ALTER TABLE feedback RENAME TO feedback_old;
         CREATE TABLE feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            body TEXT NOT NULL,
            author_id INTEGER,
            author_name TEXT NOT NULL DEFAULT '',
            anonymous INTEGER NOT NULL DEFAULT 0,
            answer TEXT NOT NULL DEFAULT '',
            answered_by TEXT NOT NULL DEFAULT '',
            answered_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
         );
         INSERT INTO feedback (
            id, kind, body, author_id, author_name, anonymous,
            answer, answered_by, answered_at, created_at, updated_at
         )
         SELECT id, kind, body, NULL, submitter_name,
                CASE WHEN submitter_name = '' THEN 1 ELSE 0 END,
                answer, answered_by, answered_at, created_at, updated_at
         FROM feedback_old;
         DROP TABLE feedback_old;
         COMMIT;",
    )
}

fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(get_feedback_db_path()).map_err(|e| e.to_string())?;
    let _ = conn.busy_timeout(Duration::from_secs(5));
    Ok(conn)
}

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

const ITEM_COLUMNS: &str = "id, kind, body, author_id, author_name, anonymous, \
     answer, answered_by, answered_at, created_at";

fn map_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredItem> {
    Ok(StoredItem {
        id: row.get(0)?,
        kind: row.get(1)?,
        body: row.get(2)?,
        author_id: row.get(3)?,
        author_name: row.get(4)?,
        anonymous: row.get::<_, i32>(5)? != 0,
        answer: row.get(6)?,
        answered_by: row.get(7)?,
        answered_at: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn find(conn: &Connection, id: i64) -> Result<StoredItem, String> {
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

pub fn list(conn: &Connection, viewer: &AuthUser) -> Result<Vec<FeedbackItem>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ITEM_COLUMNS} FROM feedback ORDER BY created_at DESC, id DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_item).map_err(|e| e.to_string())?;
    rows.map(|row| row.map(|item| item.view(viewer)))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// 投稿を保存する。匿名でも投稿者のアカウントは記録し（削除の判定に使う）、画面には出さない。
pub fn insert(
    conn: &Connection,
    input: &NewFeedback,
    author: &AuthUser,
) -> Result<FeedbackItem, String> {
    let kind = input.kind.trim();
    if !KINDS.contains(&kind) {
        return Err("種類を選んでください".into());
    }
    let body = input.body.trim();
    if body.is_empty() {
        return Err("内容を入力してください".into());
    }
    if body.chars().count() > MAX_BODY_CHARS {
        return Err(format!("内容は{MAX_BODY_CHARS}文字以内で入力してください"));
    }
    let now = now_str();
    conn.execute(
        "INSERT INTO feedback (
            kind, body, author_id, author_name, anonymous, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            kind,
            body,
            author.id,
            if input.anonymous {
                ""
            } else {
                author.display_name.as_str()
            },
            input.anonymous as i32,
            now
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(find(conn, conn.last_insert_rowid())?.view(author))
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
    Ok(find(conn, id)?.view(responder))
}

pub enum DeleteError {
    NotFound,
    Forbidden(String),
    Other(String),
}

pub fn remove(conn: &Connection, id: i64, actor: &AuthUser) -> Result<(), DeleteError> {
    let item = find(conn, id).map_err(|message| {
        if message == "投稿が見つかりません" {
            DeleteError::NotFound
        } else {
            DeleteError::Other(message)
        }
    })?;
    if !item.can_delete(actor) {
        let message = if item.is_mine(actor) {
            "回答が付いた投稿は削除できません"
        } else {
            "削除できるのは投稿した本人と管理者だけです"
        };
        return Err(DeleteError::Forbidden(message.into()));
    }
    conn.execute("DELETE FROM feedback WHERE id = ?1", params![id])
        .map_err(|e| DeleteError::Other(e.to_string()))?;
    Ok(())
}

fn fail(status: StatusCode, message: String) -> Response {
    (status, message).into_response()
}

async fn list_handler(Extension(viewer): Extension<AuthUser>) -> Response {
    match open_db().and_then(|conn| list(&conn, &viewer)) {
        Ok(items) => Json(items).into_response(),
        Err(message) => fail(StatusCode::INTERNAL_SERVER_ERROR, message),
    }
}

async fn create_handler(
    Extension(author): Extension<AuthUser>,
    Json(body): Json<NewFeedback>,
) -> Response {
    match open_db().and_then(|conn| insert(&conn, &body, &author)) {
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

async fn delete_handler(Path(id): Path<i64>, Extension(actor): Extension<AuthUser>) -> Response {
    let conn = match open_db() {
        Ok(conn) => conn,
        Err(message) => return fail(StatusCode::INTERNAL_SERVER_ERROR, message),
    };
    match remove(&conn, id, &actor) {
        Ok(()) => {
            crate::events::notify();
            StatusCode::NO_CONTENT.into_response()
        }
        Err(DeleteError::NotFound) => fail(StatusCode::NOT_FOUND, "投稿が見つかりません".into()),
        Err(DeleteError::Forbidden(message)) => fail(StatusCode::FORBIDDEN, message),
        Err(DeleteError::Other(message)) => fail(StatusCode::INTERNAL_SERVER_ERROR, message),
    }
}

/// 職員のログインが必要な API。
pub fn routes() -> Router {
    Router::new()
        .route("/feedback", get(list_handler).post(create_handler))
        .route("/feedback/{id}", delete(delete_handler))
        .route("/feedback/{id}/answer", put(answer_handler))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        conn
    }

    fn user(id: i32, name: &str) -> AuthUser {
        AuthUser {
            id,
            user_id: format!("{id:08}"),
            last_name: name.into(),
            first_name: String::new(),
            display_name: name.into(),
            is_initial_admin: false,
            can_manage_users: false,
            can_answer_feedback: false,
            modalities: Vec::new(),
        }
    }

    fn admin() -> AuthUser {
        let mut admin = user(99, "管理者");
        admin.can_manage_users = true;
        admin
    }

    fn input(body: &str, anonymous: bool) -> NewFeedback {
        NewFeedback {
            kind: "question".into(),
            body: body.into(),
            anonymous,
        }
    }

    #[test]
    fn named_post_shows_account_name() {
        let conn = conn();
        let item = insert(
            &conn,
            &input("  検査予約の見方は？ ", false),
            &user(1, "山田"),
        )
        .unwrap();
        assert_eq!(item.body, "検査予約の見方は？");
        assert_eq!(item.author_name, "山田");
        assert!(!item.anonymous);
        assert!(item.is_mine);
    }

    #[test]
    fn anonymous_post_hides_name_but_owner_is_known() {
        let conn = conn();
        let author = user(1, "山田");
        let item = insert(&conn, &input("匿名の質問", true), &author).unwrap();
        assert!(item.anonymous);
        assert_eq!(item.author_name, "");

        let mine = &list(&conn, &author).unwrap()[0];
        assert!(mine.is_mine && mine.can_delete);
        let others = &list(&conn, &user(2, "佐藤")).unwrap()[0];
        assert!(!others.is_mine && !others.can_delete);
        assert_eq!(others.author_name, "");
        // DB にも名前は残さない
        let stored: String = conn
            .query_row("SELECT author_name FROM feedback", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, "");
    }

    #[test]
    fn rejects_invalid_input() {
        let conn = conn();
        let author = user(1, "山田");
        assert!(insert(&conn, &input("   ", false), &author).is_err());
        let mut unknown = input("内容", false);
        unknown.kind = "unknown".into();
        assert!(insert(&conn, &unknown, &author).is_err());
        let long = "あ".repeat(MAX_BODY_CHARS + 1);
        assert!(insert(&conn, &input(&long, false), &author).is_err());
    }

    #[test]
    fn owner_can_delete_only_before_answer() {
        let conn = conn();
        let author = user(1, "山田");
        let responder = user(3, "回答者");
        let first = insert(&conn, &input("1件目", false), &author).unwrap();
        assert!(matches!(
            remove(&conn, first.id, &user(2, "佐藤")),
            Err(DeleteError::Forbidden(_))
        ));
        assert!(remove(&conn, first.id, &author).is_ok());
        assert!(matches!(
            remove(&conn, first.id, &author),
            Err(DeleteError::NotFound)
        ));

        let second = insert(&conn, &input("2件目", true), &author).unwrap();
        answer(&conn, second.id, "回答です", &responder).unwrap();
        assert!(!list(&conn, &author).unwrap()[0].can_delete);
        assert!(matches!(
            remove(&conn, second.id, &author),
            Err(DeleteError::Forbidden(_))
        ));
        // 回答を取り消せば、本人がまた削除できる
        answer(&conn, second.id, "", &responder).unwrap();
        assert!(list(&conn, &author).unwrap()[0].can_delete);
    }

    #[test]
    fn admin_can_delete_any_post() {
        let conn = conn();
        let item = insert(&conn, &input("不適切な投稿", true), &user(1, "山田")).unwrap();
        answer(&conn, item.id, "回答", &user(3, "回答者")).unwrap();
        assert!(list(&conn, &admin()).unwrap()[0].can_delete);
        assert!(remove(&conn, item.id, &admin()).is_ok());
        assert!(list(&conn, &admin()).unwrap().is_empty());
    }

    #[test]
    fn answer_and_clear() {
        let conn = conn();
        let item = insert(&conn, &input("質問", false), &user(1, "山田")).unwrap();
        let answered = answer(&conn, item.id, " こうします ", &user(3, "回答者")).unwrap();
        assert_eq!(answered.answer, "こうします");
        assert_eq!(answered.answered_by, "回答者");
        assert!(answered.answered_at.is_some());
        let cleared = answer(&conn, item.id, "", &user(3, "回答者")).unwrap();
        assert_eq!(cleared.answer, "");
        assert!(cleared.answered_at.is_none());
        assert!(answer(&conn, 999, "x", &user(3, "回答者")).is_err());
    }

    #[test]
    fn list_is_newest_first() {
        let conn = conn();
        let author = user(1, "山田");
        let first = insert(&conn, &input("1件目", false), &author).unwrap();
        let second = insert(&conn, &input("2件目", false), &author).unwrap();
        let ids: Vec<i64> = list(&conn, &author)
            .unwrap()
            .iter()
            .map(|item| item.id)
            .collect();
        assert_eq!(ids, vec![second.id, first.id]);
    }

    #[test]
    fn migrates_nurse_mode_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL, body TEXT NOT NULL,
                submitter_role TEXT NOT NULL,
                submitter_name TEXT NOT NULL DEFAULT '',
                department TEXT NOT NULL DEFAULT '',
                account_user_id TEXT,
                answer TEXT NOT NULL DEFAULT '', answered_by TEXT NOT NULL DEFAULT '',
                answered_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             INSERT INTO feedback (kind, body, submitter_role, submitter_name, created_at, updated_at)
             VALUES ('question', '名前なし', 'nurse', '', '2026-11-19 10:00:00', '2026-11-19 10:00:00'),
                    ('request', '名前あり', 'staff', '田中', '2026-11-19 11:00:00', '2026-11-19 11:00:00');",
        )
        .unwrap();
        init_tables(&conn).unwrap();
        init_tables(&conn).unwrap();
        let items = list(&conn, &user(1, "山田")).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].author_name, "田中");
        assert!(!items[0].anonymous);
        assert!(items[1].anonymous);
        assert!(!items[0].can_delete);
        assert!(list(&conn, &admin()).unwrap()[0].can_delete);
    }
}
