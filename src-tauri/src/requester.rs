// src-tauri/src/requester.rs
// 依頼科・依頼医の一覧（入力候補）。科と医師は紐付けずに別々に持つ。
// 業務データ（rct_local.db）とは別の requesters.db に保存する。
// オーダー・治療依頼を保存したあと、まだ一覧にない名前は自動で登録する。
// オーダー側には名前を文字列のまま残すので、ここで名前を変えても過去の記録は変わらない。

use crate::auth::AuthUser;
use crate::db::get_requesters_db_path;
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Extension, Json, Router};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const NAME_LIMIT: usize = 100;

/// 一覧を作る前から使っていた依頼科。最初に一覧を作るときだけ登録する。
const INITIAL_DEPARTMENTS: &[&str] = &[
    "乳腺内分泌外科",
    "呼吸器科",
    "ひ尿器科",
    "婦人科",
    "血液・腫瘍内科",
    "耳鼻咽喉科",
    "消化器科",
    "消化器外科",
    "脳神経外科",
    "整形外科",
    "皮膚科",
    "腎臓科",
    "感染症科",
    "脳神経内科",
    "循環器科",
    "小児循環器科",
    "小児科",
    "新生児科",
    "外科",
    "呼吸器外科",
    "小児外科",
    "リウマチ科",
    "心臓血管外科",
    "小児心臓外科",
    "産科",
    "産婦人科",
    "眼科",
    "放射線科",
    "その他",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Department,
    Physician,
}

impl Kind {
    fn table(self) -> &'static str {
        match self {
            Kind::Department => "departments",
            Kind::Physician => "physicians",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Kind::Department => "依頼科",
            Kind::Physician => "依頼医",
        }
    }

    /// 既存の記録でこの名前を持つ列
    fn history_column(self) -> &'static str {
        match self {
            Kind::Department => "requesting_department",
            Kind::Physician => "requesting_physician",
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Requester {
    pub id: i32,
    pub name: String,
    pub use_count: i64,
    pub last_used_at: Option<String>,
    pub created_at: String,
}

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// 前後の空白を除き、続く空白（全角を含む）は半角1つにまとめる。
pub fn normalize_name(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn validate_name(kind: Kind, raw: &str) -> Result<String, String> {
    let name = normalize_name(raw);
    if name.is_empty() {
        return Err(format!("{}を入力してください", kind.label()));
    }
    if name.chars().count() > NAME_LIMIT {
        return Err(format!("{}は{NAME_LIMIT}文字以内です", kind.label()));
    }
    Ok(name)
}

fn table_exists(conn: &Connection, table: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![table],
        |row| row.get(0),
    )
}

fn create_table(conn: &Connection, kind: Kind) -> rusqlite::Result<()> {
    conn.execute(
        &format!(
            "CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                use_count INTEGER NOT NULL DEFAULT 0,
                last_used_at TEXT,
                created_at TEXT NOT NULL
            )",
            kind.table()
        ),
        [],
    )?;
    Ok(())
}

/// テーブルだけを作る（テスト用）。
#[cfg(test)]
pub fn create_tables(conn: &Connection) -> rusqlite::Result<()> {
    create_table(conn, Kind::Department)?;
    create_table(conn, Kind::Physician)
}

/// requesters.db を開いて準備する。`source` は rct_local.db。
pub fn init_db(source: &Connection) -> rusqlite::Result<()> {
    let conn = Connection::open(get_requesters_db_path())?;
    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;
    init_on(&conn, source)
}

/// 一覧のテーブルを作る。初めて作ったときは、
/// - 前の版で rct_local.db に作った一覧があれば、それをそのままコピーする
/// - なければ、既存のオーダー・治療依頼から名前を取り込む
/// コピーが済んだ rct_local.db 側の一覧は削除する。
/// 2回目以降の起動では取り込まないので、一覧から削除した名前が勝手に戻ることはない。
pub fn init_on(conn: &Connection, source: &Connection) -> rusqlite::Result<()> {
    normalize_history(source)?;
    for kind in [Kind::Department, Kind::Physician] {
        let is_new = !table_exists(conn, kind.table())?;
        create_table(conn, kind)?;
        let previous = table_exists(source, kind.table())?;
        if is_new {
            if previous {
                copy_previous(conn, source, kind)?;
            } else {
                let initial: &[&str] = match kind {
                    Kind::Department => INITIAL_DEPARTMENTS,
                    Kind::Physician => &[],
                };
                seed(conn, source, kind, initial)?;
            }
        }
        // requesters.db へ移したあとの古い一覧は消す（前回コピー後に削除だけ失敗していた場合も消える）。
        if previous {
            source.execute(&format!("DROP TABLE {}", kind.table()), [])?;
        }
    }
    Ok(())
}

/// 前の版で rct_local.db に作った一覧を、ID・使用回数ごと requesters.db へ写す。
fn copy_previous(conn: &Connection, source: &Connection, kind: Kind) -> rusqlite::Result<()> {
    let rows = {
        let mut stmt = source.prepare(&format!(
            "SELECT id, name, use_count, last_used_at, created_at FROM {}",
            kind.table()
        ))?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let tx = conn.unchecked_transaction()?;
    for (id, name, use_count, last_used_at, created_at) in rows {
        tx.execute(
            &format!(
                "INSERT OR IGNORE INTO {} (id, name, use_count, last_used_at, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                kind.table()
            ),
            params![id, name, use_count, last_used_at, created_at],
        )?;
    }
    tx.commit()
}

/// 既存のオーダー・治療依頼の依頼科・依頼医を、保存時と同じ表記にそろえる（rct_local.db 側）。
/// 毎回の起動で呼ぶが、すでにそろっている行は書き換えない。
fn normalize_history(conn: &Connection) -> rusqlite::Result<()> {
    for table in ["exam_orders", "treatment_requests"] {
        if !table_exists(conn, table)? {
            continue;
        }
        for kind in [Kind::Department, Kind::Physician] {
            let column = kind.history_column();
            let rows = {
                let mut stmt = conn.prepare(&format!(
                    "SELECT DISTINCT {column} FROM {table} WHERE {column} != ''"
                ))?;
                let names = stmt.query_map([], |row| row.get::<_, String>(0))?;
                names.collect::<rusqlite::Result<Vec<_>>>()?
            };
            for raw in rows {
                let name = normalize_name(&raw);
                if name != raw {
                    conn.execute(
                        &format!("UPDATE {table} SET {column} = ?1 WHERE {column} = ?2"),
                        params![name, raw],
                    )?;
                }
            }
        }
    }
    Ok(())
}

fn seed(
    conn: &Connection,
    source: &Connection,
    kind: Kind,
    initial: &[&str],
) -> rusqlite::Result<()> {
    let now = now_str();
    // 既存のオーダー・治療依頼で使われた名前を、使われた回数ごと取り込む。
    let mut counts: BTreeMap<String, i64> = BTreeMap::new();
    for table in ["exam_orders", "treatment_requests"] {
        if !table_exists(source, table)? {
            continue;
        }
        let column = kind.history_column();
        let mut stmt = source.prepare(&format!(
            "SELECT {column}, COUNT(*) FROM {table} GROUP BY {column}"
        ))?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        for row in rows {
            let (raw, count) = row?;
            let name = normalize_name(&raw);
            if name.is_empty() || name.chars().count() > NAME_LIMIT {
                continue;
            }
            *counts.entry(name).or_default() += count;
        }
    }

    let tx = conn.unchecked_transaction()?;
    for name in initial {
        tx.execute(
            &format!(
                "INSERT OR IGNORE INTO {} (name, use_count, created_at) VALUES (?1, 0, ?2)",
                kind.table()
            ),
            params![name, now],
        )?;
    }
    for (name, count) in counts {
        tx.execute(
            &format!(
                "INSERT INTO {} (name, use_count, created_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(name) DO UPDATE SET use_count = use_count + excluded.use_count",
                kind.table()
            ),
            params![name, count, now],
        )?;
    }
    tx.commit()
}

fn record_one(conn: &Connection, kind: Kind, raw: &str, now: &str) -> Result<(), String> {
    let name = normalize_name(raw);
    // 空欄や長すぎる名前は候補に入れない（オーダーの保存は止めない）。
    if name.is_empty() || name.chars().count() > NAME_LIMIT {
        return Ok(());
    }
    conn.execute(
        &format!(
            "INSERT INTO {} (name, use_count, last_used_at, created_at) VALUES (?1, 1, ?2, ?2)
             ON CONFLICT(name) DO UPDATE SET use_count = use_count + 1, last_used_at = excluded.last_used_at",
            kind.table()
        ),
        params![name, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 一覧にない名前は登録し、ある名前は使用回数を増やす。
pub fn record_on(conn: &Connection, department: &str, physician: &str) -> Result<(), String> {
    let now = now_str();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    record_one(&tx, Kind::Department, department, &now)?;
    record_one(&tx, Kind::Physician, physician, &now)?;
    tx.commit().map_err(|e| e.to_string())
}

/// オーダー・治療依頼を rct_local.db に保存し終えたあとに呼ぶ。
/// 一覧は入力の補助なので、ここで失敗してもオーダーの保存は取り消さず、ログに残すだけにする。
pub fn record(department: &str, physician: &str) {
    if let Err(error) = open().and_then(|conn| record_on(&conn, department, physician)) {
        log::warn!("依頼科・依頼医の一覧を更新できませんでした: {error}");
        eprintln!("依頼科・依頼医の一覧を更新できませんでした: {error}");
    }
}

fn open() -> Result<Connection, String> {
    let conn = Connection::open(get_requesters_db_path()).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// よく使う名前から順に返す。
pub fn list_on(conn: &Connection, kind: Kind) -> Result<Vec<Requester>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, name, use_count, last_used_at, created_at FROM {}
             ORDER BY use_count DESC, id ASC",
            kind.table()
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Requester {
                id: row.get(0)?,
                name: row.get(1)?,
                use_count: row.get(2)?,
                last_used_at: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

fn find_by_name(conn: &Connection, kind: Kind, name: &str) -> Result<Option<i32>, String> {
    conn.query_row(
        &format!("SELECT id FROM {} WHERE name = ?1", kind.table()),
        params![name],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn create_on(conn: &Connection, kind: Kind, raw: &str) -> Result<Requester, String> {
    let name = validate_name(kind, raw)?;
    if find_by_name(conn, kind, &name)?.is_some() {
        return Err(format!("{name} はすでに登録されています"));
    }
    conn.execute(
        &format!(
            "INSERT INTO {} (name, use_count, created_at) VALUES (?1, 0, ?2)",
            kind.table()
        ),
        params![name, now_str()],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid() as i32;
    list_on(conn, kind)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "登録した名前が見つかりません".to_string())
}

pub fn rename_on(conn: &Connection, kind: Kind, id: i32, raw: &str) -> Result<(), String> {
    let name = validate_name(kind, raw)?;
    if let Some(other) = find_by_name(conn, kind, &name)? {
        if other != id {
            return Err(format!("{name} はすでに登録されています"));
        }
    }
    let changed = conn
        .execute(
            &format!("UPDATE {} SET name = ?1 WHERE id = ?2", kind.table()),
            params![name, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err(format!("{}が見つかりません", kind.label()));
    }
    Ok(())
}

pub fn delete_on(conn: &Connection, kind: Kind, id: i32) -> Result<(), String> {
    let changed = conn
        .execute(
            &format!("DELETE FROM {} WHERE id = ?1", kind.table()),
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err(format!("{}が見つかりません", kind.label()));
    }
    Ok(())
}

// ---- HTTP ----

#[derive(Deserialize)]
struct NameBody {
    name: String,
}

fn bad_request(message: String) -> Response {
    (StatusCode::BAD_REQUEST, message).into_response()
}

fn forbid_unless_manager(actor: &AuthUser) -> Option<Response> {
    if actor.can_manage() {
        None
    } else {
        Some(
            (
                StatusCode::FORBIDDEN,
                "依頼科・依頼医を変更する権限がありません",
            )
                .into_response(),
        )
    }
}

fn list_response(kind: Kind) -> Response {
    match open().and_then(|conn| list_on(&conn, kind)) {
        Ok(items) => Json(items).into_response(),
        Err(message) => bad_request(message),
    }
}

fn create_response(kind: Kind, actor: &AuthUser, name: &str) -> Response {
    if let Some(response) = forbid_unless_manager(actor) {
        return response;
    }
    match open().and_then(|conn| create_on(&conn, kind, name)) {
        Ok(item) => {
            crate::events::notify();
            Json(item).into_response()
        }
        Err(message) => bad_request(message),
    }
}

fn rename_response(kind: Kind, actor: &AuthUser, id: i32, name: &str) -> Response {
    if let Some(response) = forbid_unless_manager(actor) {
        return response;
    }
    match open().and_then(|conn| rename_on(&conn, kind, id, name)) {
        Ok(()) => {
            crate::events::notify();
            StatusCode::NO_CONTENT.into_response()
        }
        Err(message) => bad_request(message),
    }
}

fn delete_response(kind: Kind, actor: &AuthUser, id: i32) -> Response {
    if let Some(response) = forbid_unless_manager(actor) {
        return response;
    }
    match open().and_then(|conn| delete_on(&conn, kind, id)) {
        Ok(()) => {
            crate::events::notify();
            StatusCode::NO_CONTENT.into_response()
        }
        Err(message) => bad_request(message),
    }
}

async fn list_departments() -> Response {
    list_response(Kind::Department)
}

async fn create_department(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<NameBody>,
) -> Response {
    create_response(Kind::Department, &actor, &body.name)
}

async fn rename_department(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<NameBody>,
) -> Response {
    rename_response(Kind::Department, &actor, id, &body.name)
}

async fn delete_department(Path(id): Path<i32>, Extension(actor): Extension<AuthUser>) -> Response {
    delete_response(Kind::Department, &actor, id)
}

async fn list_physicians() -> Response {
    list_response(Kind::Physician)
}

async fn create_physician(
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<NameBody>,
) -> Response {
    create_response(Kind::Physician, &actor, &body.name)
}

async fn rename_physician(
    Path(id): Path<i32>,
    Extension(actor): Extension<AuthUser>,
    Json(body): Json<NameBody>,
) -> Response {
    rename_response(Kind::Physician, &actor, id, &body.name)
}

async fn delete_physician(Path(id): Path<i32>, Extension(actor): Extension<AuthUser>) -> Response {
    delete_response(Kind::Physician, &actor, id)
}

/// 一覧の取得はログインした人なら誰でも、追加・変更・削除は担当者管理権限を持つ人だけができる。
pub fn routes() -> Router {
    Router::new()
        .route(
            "/departments",
            get(list_departments).post(create_department),
        )
        .route(
            "/departments/{id}",
            put(rename_department).delete(delete_department),
        )
        .route("/physicians", get(list_physicians).post(create_physician))
        .route(
            "/physicians/{id}",
            put(rename_physician).delete(delete_physician),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(conn: &Connection, kind: Kind) -> Vec<String> {
        list_on(conn, kind)
            .unwrap()
            .into_iter()
            .map(|item| item.name)
            .collect()
    }

    #[test]
    fn normalizes_spaces() {
        assert_eq!(normalize_name("  山田\u{3000}太郎 "), "山田 太郎");
        assert_eq!(normalize_name("山田  太郎"), "山田 太郎");
        assert_eq!(normalize_name(" \u{3000} "), "");
    }

    /// rct_local.db の代わり
    fn source_db() -> Connection {
        let source = Connection::open_in_memory().unwrap();
        source.execute_batch(
            "CREATE TABLE exam_orders (requesting_department TEXT NOT NULL, requesting_physician TEXT NOT NULL);
             CREATE TABLE treatment_requests (requesting_department TEXT NOT NULL, requesting_physician TEXT NOT NULL);
             INSERT INTO exam_orders VALUES ('外科', '山田 太郎'), ('外科', '山田　太郎'), ('新しい科', ''), ('外科', '佐藤 花子');
             INSERT INTO treatment_requests VALUES ('放射線科', '佐藤 花子'), ('放射線科', '佐藤 花子');",
        )
        .unwrap();
        source
    }

    #[test]
    fn seeds_from_existing_records_only_once() {
        let source = source_db();
        let conn = Connection::open_in_memory().unwrap();
        init_on(&conn, &source).unwrap();

        let physicians = list_on(&conn, Kind::Physician).unwrap();
        assert_eq!(
            physicians
                .iter()
                .map(|item| (item.name.as_str(), item.use_count))
                .collect::<Vec<_>>(),
            vec![("佐藤 花子", 3), ("山田 太郎", 2)]
        );

        // 既存の記録の表記もそろう
        let raw: Vec<String> = source
            .prepare("SELECT requesting_physician FROM exam_orders")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(raw, vec!["山田 太郎", "山田 太郎", "", "佐藤 花子"]);

        let departments = names(&conn, Kind::Department);
        assert_eq!(departments[0], "外科");
        assert!(departments.contains(&"新しい科".to_string()));
        assert!(departments.contains(&"乳腺内分泌外科".to_string()));

        // 削除した名前は、次の起動で取り込み直さない。
        let id = list_on(&conn, Kind::Physician).unwrap()[0].id;
        delete_on(&conn, Kind::Physician, id).unwrap();
        init_on(&conn, &source).unwrap();
        assert_eq!(names(&conn, Kind::Physician), vec!["山田 太郎"]);

        // 一覧は rct_local.db 側には作らない
        assert!(!table_exists(&source, "physicians").unwrap());
        assert!(!table_exists(&source, "departments").unwrap());
    }

    #[test]
    fn moves_the_previous_lists_out_of_rct_local() {
        // 前の版は rct_local.db に一覧を作っていた
        let source = source_db();
        source
            .execute_batch(
                "CREATE TABLE departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
                    use_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL);
                 CREATE TABLE physicians (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
                    use_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL);
                 INSERT INTO departments VALUES (5, '外科', 7, '2026-11-20 10:00:00', '2026-11-01 09:00:00');
                 INSERT INTO physicians VALUES (3, '手で直した 名前', 4, NULL, '2026-11-01 09:00:00');",
            )
            .unwrap();
        let conn = Connection::open_in_memory().unwrap();
        init_on(&conn, &source).unwrap();

        // 既存の記録から取り込み直すのではなく、前の一覧をそのまま写す
        assert_eq!(
            list_on(&conn, Kind::Department).unwrap(),
            vec![Requester {
                id: 5,
                name: "外科".into(),
                use_count: 7,
                last_used_at: Some("2026-11-20 10:00:00".into()),
                created_at: "2026-11-01 09:00:00".into(),
            }]
        );
        assert_eq!(names(&conn, Kind::Physician), vec!["手で直した 名前"]);
        // 写し終えた rct_local.db 側の一覧は消える
        assert!(!table_exists(&source, "departments").unwrap());
        assert!(!table_exists(&source, "physicians").unwrap());

        // 次の起動でも変わらない
        init_on(&conn, &source).unwrap();
        assert_eq!(names(&conn, Kind::Physician), vec!["手で直した 名前"]);
    }

    #[test]
    fn record_adds_new_names_and_counts_known_ones() {
        let conn = Connection::open_in_memory().unwrap();
        create_tables(&conn).unwrap();
        record_on(&conn, "外科", "山田 太郎").unwrap();
        record_on(&conn, " 外科 ", "鈴木\u{3000}一郎").unwrap();
        record_on(&conn, "", "").unwrap();

        let departments = list_on(&conn, Kind::Department).unwrap();
        assert_eq!(departments.len(), 1);
        assert_eq!(departments[0].name, "外科");
        assert_eq!(departments[0].use_count, 2);
        assert!(departments[0].last_used_at.is_some());
        assert_eq!(
            names(&conn, Kind::Physician),
            vec!["山田 太郎", "鈴木 一郎"]
        );
    }

    #[test]
    fn create_rename_delete() {
        let conn = Connection::open_in_memory().unwrap();
        create_tables(&conn).unwrap();
        let a = create_on(&conn, Kind::Physician, "山田 太郎").unwrap();
        let b = create_on(&conn, Kind::Physician, "山田 太朗").unwrap();
        assert!(create_on(&conn, Kind::Physician, "山田\u{3000}太郎").is_err());
        assert!(create_on(&conn, Kind::Physician, "  ").is_err());

        assert!(rename_on(&conn, Kind::Physician, b.id, "山田 太郎").is_err());
        rename_on(&conn, Kind::Physician, a.id, "山田 太郎").unwrap();
        rename_on(&conn, Kind::Physician, b.id, "山田 次郎").unwrap();
        assert_eq!(
            names(&conn, Kind::Physician),
            vec!["山田 太郎", "山田 次郎"]
        );

        delete_on(&conn, Kind::Physician, a.id).unwrap();
        assert!(delete_on(&conn, Kind::Physician, a.id).is_err());
        assert_eq!(names(&conn, Kind::Physician), vec!["山田 次郎"]);
        // 科と医師は別々に持つ
        assert!(names(&conn, Kind::Department).is_empty());
    }
}
