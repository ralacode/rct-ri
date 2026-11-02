// 担当者ログイン。パスワードは argon2id（固有 salt 付き）、セッションは HttpOnly Cookie。
// 担当者データは exe 横の user.db に置く。

use crate::db::get_user_db_path;
use cookie::{Cookie, SameSite};
use rand::RngCore;
use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::time::Duration;

pub const SESSION_COOKIE: &str = "rct_session";
pub const DEFAULT_MODALITY_NAME: &str = "一般撮影";
const SESSION_HOURS: i64 = 12;
const MIN_PASSWORD_LEN: usize = 8;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: i32,
    pub user_id: String,
    pub last_name: String,
    pub first_name: String,
    pub display_name: String,
    pub is_initial_admin: bool,
    pub can_manage_users: bool,
    pub modalities: Vec<Modality>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Modality {
    pub id: i32,
    pub name: String,
    pub is_default: bool,
}

impl AuthUser {
    pub fn can_manage(&self) -> bool {
        self.is_initial_admin || self.can_manage_users
    }
}

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            last_name TEXT NOT NULL,
            first_name TEXT NOT NULL,
            is_initial_admin INTEGER NOT NULL DEFAULT 0,
            can_manage_users INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )",
        [],
    )?;
    let _ = conn.execute(
        "ALTER TABLE users ADD COLUMN is_initial_admin INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE users ADD COLUMN can_manage_users INTEGER NOT NULL DEFAULT 0",
        [],
    );
    migrate_initial_admin(conn)?;
    init_modality_tables(conn)?;
    Ok(())
}

fn init_modality_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS modalities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_modalities (
            user_id INTEGER NOT NULL,
            modality_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, modality_id),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (modality_id) REFERENCES modalities (id)
        )",
        [],
    )?;
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT OR IGNORE INTO modalities (name, is_default, created_at) VALUES (?1, 1, ?2)",
        params![DEFAULT_MODALITY_NAME, created_at],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO user_modalities (user_id, modality_id)
         SELECT u.id, m.id
         FROM users u
         JOIN modalities m ON m.is_default = 1
         WHERE NOT EXISTS (
             SELECT 1 FROM user_modalities um WHERE um.user_id = u.id
         )",
        [],
    )?;
    Ok(())
}

fn migrate_initial_admin(conn: &Connection) -> rusqlite::Result<()> {
    let has_users: i64 =
        conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    if has_users == 0 {
        return Ok(());
    }
    let has_initial: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE is_initial_admin = 1",
        [],
        |row| row.get(0),
    )?;
    if has_initial > 0 {
        return Ok(());
    }
    conn.execute(
        "UPDATE users SET is_initial_admin = 1, can_manage_users = 1
         WHERE id = (SELECT MIN(id) FROM users)",
        [],
    )?;
    Ok(())
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

fn expires_str() -> String {
    (chrono::Local::now() + chrono::Duration::hours(SESSION_HOURS))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn to_half_width_digit(c: char) -> char {
    if ('０'..='９').contains(&c) {
        char::from_u32(c as u32 - 0xFEE0).unwrap_or(c)
    } else {
        c
    }
}

fn normalize_user_id(raw: &str) -> Result<String, String> {
    let user_id: String = raw.trim().chars().map(to_half_width_digit).collect();
    if user_id.len() != 8 || !user_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("ユーザーIDは8桁の数字です".into());
    }
    Ok(user_id)
}

fn normalize_name(raw: &str, label: &str) -> Result<String, String> {
    let name = raw.trim().to_string();
    if name.is_empty() {
        return Err(format!("{label}は必須です"));
    }
    Ok(name)
}

fn display_name(last_name: &str, first_name: &str) -> String {
    format!("{last_name} {first_name}")
}

fn validate_password(password: &str) -> Result<(), String> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err(format!(
            "パスワードは{MIN_PASSWORD_LEN}文字以上にしてください"
        ));
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, String> {
    use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
    use argon2::Argon2;

    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| error.to_string())
}

fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    use argon2::Argon2;

    PasswordHash::new(hash)
        .ok()
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .ok()
        })
        .is_some()
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn new_session_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn map_user(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuthUser> {
    let last_name: String = row.get(2)?;
    let first_name: String = row.get(3)?;
    let is_initial_admin = row.get::<_, i32>(4)? != 0;
    let stored_can_manage = row.get::<_, i32>(5)? != 0;
    Ok(AuthUser {
        id: row.get(0)?,
        user_id: row.get(1)?,
        display_name: display_name(&last_name, &first_name),
        last_name,
        first_name,
        is_initial_admin,
        can_manage_users: is_initial_admin || stored_can_manage,
        modalities: Vec::new(),
    })
}

const USER_COLUMNS: &str = "id, user_id, last_name, first_name, is_initial_admin, can_manage_users";
const USER_COLUMNS_JOINED: &str =
    "u.id, u.user_id, u.last_name, u.first_name, u.is_initial_admin, u.can_manage_users";

pub fn user_count() -> Result<i64, String> {
    let conn = open_db()?;
    conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

fn cleanup_expired(conn: &Connection) {
    let now = now_str();
    let _ = conn.execute("DELETE FROM sessions WHERE expires_at < ?1", params![now]);
}

fn insert_user(
    conn: &Connection,
    user_id: &str,
    password: &str,
    last_name: &str,
    first_name: &str,
    is_initial_admin: bool,
) -> Result<AuthUser, String> {
    let user_id = normalize_user_id(user_id)?;
    let last_name = normalize_name(last_name, "姓")?;
    let first_name = normalize_name(first_name, "名")?;
    validate_password(password)?;
    let password_hash = hash_password(password)?;
    let created_at = now_str();
    conn.execute(
        "INSERT INTO users (
            user_id, password_hash, last_name, first_name,
            is_initial_admin, can_manage_users, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            user_id,
            password_hash,
            last_name,
            first_name,
            if is_initial_admin { 1 } else { 0 },
            if is_initial_admin { 1 } else { 0 },
            created_at
        ],
    )
    .map_err(|error| {
        if error.to_string().contains("UNIQUE") {
            "そのユーザーIDは既に使われています".to_string()
        } else {
            error.to_string()
        }
    })?;
    let id = conn.last_insert_rowid() as i32;
    Ok(AuthUser {
        id,
        user_id,
        display_name: display_name(&last_name, &first_name),
        last_name,
        first_name,
        is_initial_admin,
        can_manage_users: is_initial_admin,
        modalities: Vec::new(),
    })
}

fn create_session(conn: &Connection, account_id: i32) -> Result<String, String> {
    cleanup_expired(conn);
    let token = new_session_token();
    let token_hash = hash_token(&token);
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![token_hash, account_id, expires_str(), now_str()],
    )
    .map_err(|e| e.to_string())?;
    Ok(token)
}

pub fn setup_first_admin(
    user_id: &str,
    password: &str,
    last_name: &str,
    first_name: &str,
    modality_ids: &[i32],
) -> Result<(AuthUser, String), String> {
    let conn = open_db()?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err("初期管理者はすでに作成済みです".into());
    }
    let user = insert_user(&conn, user_id, password, last_name, first_name, true)?;
    replace_user_modalities(&conn, user.id, modality_ids)?;
    let user = with_modalities(&conn, user)?;
    let token = create_session(&conn, user.id)?;
    Ok((user, token))
}

pub fn login(user_id: &str, password: &str) -> Result<(AuthUser, String), String> {
    let conn = open_db()?;
    cleanup_expired(&conn);
    let user_id = normalize_user_id(user_id)
        .map_err(|_| "ユーザーIDまたはパスワードが正しくありません".to_string())?;
    let row = conn.query_row(
        &format!(
            "SELECT {USER_COLUMNS}, password_hash FROM users WHERE user_id = ?1"
        ),
        params![user_id],
        |row| Ok((map_user(row)?, row.get::<_, String>(6)?)),
    );
    let (user, password_hash) = match row {
        Ok(value) => value,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err("ユーザーIDまたはパスワードが正しくありません".into());
        }
        Err(error) => return Err(error.to_string()),
    };
    if !verify_password(password, &password_hash) {
        return Err("ユーザーIDまたはパスワードが正しくありません".into());
    }
    let token = create_session(&conn, user.id)?;
    Ok((with_modalities(&conn, user)?, token))
}

pub fn logout(token: Option<&str>) {
    let Some(token) = token.filter(|value| !value.is_empty()) else {
        return;
    };
    if let Ok(conn) = open_db() {
        let _ = conn.execute(
            "DELETE FROM sessions WHERE token_hash = ?1",
            params![hash_token(token)],
        );
    }
}

pub fn user_from_token(token: &str) -> Result<AuthUser, String> {
    let conn = open_db()?;
    cleanup_expired(&conn);
    let now = now_str();
    let user = conn
        .query_row(
            &format!(
                "SELECT {USER_COLUMNS_JOINED}
                 FROM sessions s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = ?1 AND s.expires_at >= ?2"
            ),
            params![hash_token(token), now],
            map_user,
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => "ログインが必要です".into(),
            other => other.to_string(),
        })?;
    with_modalities(&conn, user)
}

pub fn token_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let value = headers
        .get(axum::http::header::COOKIE)?
        .to_str()
        .ok()?;
    for part in value.split(';') {
        let part = part.trim();
        let Some(raw) = part.strip_prefix(SESSION_COOKIE) else {
            continue;
        };
        let Some(token) = raw.strip_prefix('=') else {
            continue;
        };
        if !token.is_empty() {
            return Some(token.to_string());
        }
    }
    None
}

pub fn user_from_headers(headers: &axum::http::HeaderMap) -> Result<AuthUser, String> {
    let token = token_from_headers(headers).ok_or_else(|| "ログインが必要です".to_string())?;
    user_from_token(&token)
}

pub fn list_users() -> Result<Vec<AuthUser>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {USER_COLUMNS} FROM users ORDER BY id ASC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_user)
        .map_err(|e| e.to_string())?;
    let mut users = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for user in &mut users {
        user.modalities = modalities_for_user(&conn, user.id)?;
    }
    Ok(users)
}

pub fn create_user(
    user_id: &str,
    password: &str,
    last_name: &str,
    first_name: &str,
    modality_ids: &[i32],
) -> Result<AuthUser, String> {
    let conn = open_db()?;
    let user = insert_user(&conn, user_id, password, last_name, first_name, false)?;
    replace_user_modalities(&conn, user.id, modality_ids)?;
    with_modalities(&conn, user)
}

fn is_initial_admin_id(conn: &Connection, id: i32) -> Result<bool, String> {
    let flag: i32 = conn
        .query_row(
            "SELECT is_initial_admin FROM users WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => "担当者が見つかりません".to_string(),
            other => other.to_string(),
        })?;
    Ok(flag != 0)
}

pub fn delete_user(id: i32) -> Result<(), String> {
    let conn = open_db()?;
    if is_initial_admin_id(&conn, id)? {
        return Err("初期管理者は削除できません".into());
    }
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count <= 1 {
        return Err("最後の担当者は削除できません".into());
    }
    let deleted = conn
        .execute("DELETE FROM users WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("担当者が見つかりません".into());
    }
    Ok(())
}

pub fn set_manage_users(id: i32, can_manage: bool) -> Result<(), String> {
    let conn = open_db()?;
    if is_initial_admin_id(&conn, id)? {
        return Err("初期管理者のユーザー管理権限は変更できません".into());
    }
    let updated = conn
        .execute(
            "UPDATE users SET can_manage_users = ?1 WHERE id = ?2",
            params![if can_manage { 1 } else { 0 }, id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("担当者が見つかりません".into());
    }
    Ok(())
}

fn map_modality(row: &rusqlite::Row<'_>) -> rusqlite::Result<Modality> {
    Ok(Modality {
        id: row.get(0)?,
        name: row.get(1)?,
        is_default: row.get::<_, i32>(2)? != 0,
    })
}

fn modalities_for_user(conn: &Connection, user_id: i32) -> Result<Vec<Modality>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.name, m.is_default
             FROM user_modalities um
             JOIN modalities m ON m.id = um.modality_id
             WHERE um.user_id = ?1
             ORDER BY m.is_default DESC, m.id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], map_modality)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn with_modalities(conn: &Connection, mut user: AuthUser) -> Result<AuthUser, String> {
    user.modalities = modalities_for_user(conn, user.id)?;
    Ok(user)
}

fn replace_user_modalities(
    conn: &Connection,
    user_id: i32,
    modality_ids: &[i32],
) -> Result<(), String> {
    let mut unique = Vec::new();
    for id in modality_ids {
        if !unique.contains(id) {
            unique.push(*id);
        }
    }
    if unique.is_empty() {
        return Err("担当モダリティは1つ以上選んでください".into());
    }
    for id in &unique {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM modalities WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err("存在しないモダリティが含まれています".into());
        }
    }
    conn.execute(
        "DELETE FROM user_modalities WHERE user_id = ?1",
        params![user_id],
    )
    .map_err(|e| e.to_string())?;
    for id in unique {
        conn.execute(
            "INSERT INTO user_modalities (user_id, modality_id) VALUES (?1, ?2)",
            params![user_id, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn list_modalities() -> Result<Vec<Modality>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare("SELECT id, name, is_default FROM modalities ORDER BY is_default DESC, id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_modality)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn normalize_modality_name(raw: &str) -> Result<String, String> {
    let name = raw.trim().to_string();
    if name.is_empty() {
        return Err("モダリティ名は必須です".into());
    }
    Ok(name)
}

pub fn create_modality(name: &str) -> Result<Modality, String> {
    let conn = open_db()?;
    let name = normalize_modality_name(name)?;
    conn.execute(
        "INSERT INTO modalities (name, is_default, created_at) VALUES (?1, 0, ?2)",
        params![name, now_str()],
    )
    .map_err(|error| {
        if error.to_string().contains("UNIQUE") {
            "同じ名前のモダリティがあります".to_string()
        } else {
            error.to_string()
        }
    })?;
    let id = conn.last_insert_rowid() as i32;
    Ok(Modality {
        id,
        name,
        is_default: false,
    })
}

pub fn rename_modality(id: i32, name: &str) -> Result<(), String> {
    let conn = open_db()?;
    let name = normalize_modality_name(name)?;
    let updated = conn
        .execute(
            "UPDATE modalities SET name = ?1 WHERE id = ?2",
            params![name, id],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE") {
                "同じ名前のモダリティがあります".to_string()
            } else {
                error.to_string()
            }
        })?;
    if updated == 0 {
        return Err("モダリティが見つかりません".into());
    }
    Ok(())
}

pub fn delete_modality(id: i32) -> Result<(), String> {
    let conn = open_db()?;
    let is_default: i32 = conn
        .query_row(
            "SELECT is_default FROM modalities WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => "モダリティが見つかりません".to_string(),
            other => other.to_string(),
        })?;
    if is_default != 0 {
        return Err("一般撮影は削除できません".into());
    }
    let assigned: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_modalities WHERE modality_id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if assigned > 0 {
        return Err("割り当て中のモダリティは削除できません".into());
    }
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM modalities", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count <= 1 {
        return Err("最後のモダリティは削除できません".into());
    }
    conn.execute("DELETE FROM modalities WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_user_modalities(user_id: i32, modality_ids: &[i32]) -> Result<AuthUser, String> {
    let conn = open_db()?;
    let user = conn
        .query_row(
            &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
            params![user_id],
            map_user,
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => "担当者が見つかりません".into(),
            other => other.to_string(),
        })?;
    replace_user_modalities(&conn, user.id, modality_ids)?;
    with_modalities(&conn, user)
}

pub fn change_password(id: i32, password: &str) -> Result<(), String> {
    validate_password(password)?;
    let conn = open_db()?;
    let password_hash = hash_password(password)?;
    let updated = conn
        .execute(
            "UPDATE users SET password_hash = ?1 WHERE id = ?2",
            params![password_hash, id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("担当者が見つかりません".into());
    }
    let _ = conn.execute("DELETE FROM sessions WHERE user_id = ?1", params![id]);
    Ok(())
}

pub fn session_cookie(token: &str) -> String {
    Cookie::build((SESSION_COOKIE, token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .build()
        .to_string()
}

pub fn clear_session_cookie() -> String {
    Cookie::build((SESSION_COOKIE, ""))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(cookie::time::Duration::seconds(0))
        .build()
        .to_string()
}
