//! 作業報告書（メーカーの保守・修理の報告）の保存。
//!
//! データは exe 横の `db/work_report.db` に置く（業務データ・担当者データとは別ファイル）。
//!
//! - メーカー・装置・作業担当者（メーカー側の人）は一覧にして、報告書から選べるようにする。
//! - 担当技師（院内の担当者）は担当者一覧（user.db）から選ぶ。担当者が消されても困らないよう、
//!   報告書には名前も一緒に残す。
//! - 報告書のメーカー表記が変わっても（VARIAN → Siemens Healthineers）、
//!   装置（納入商品の番号）で同じ装置の履歴にまとめる。
//! - PDF・JSON から取り込んだ報告書は「要確認」として登録し、画面で確かめてから「確認済み」にする。

use crate::db::get_work_report_db_path;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const STATUS_REVIEW: &str = "review";
pub const STATUS_CONFIRMED: &str = "confirmed";
const STATUSES: [&str; 2] = [STATUS_REVIEW, STATUS_CONFIRMED];

const SHORT_LIMIT: usize = 200;
const LONG_LIMIT: usize = 10_000;

/// 最初から登録しておくメーカー。今の報告書は Siemens Healthineers のロゴだが、
/// Siemens はほかの装置（CT など）も扱うので、別名には入れない。
/// リニアックの報告書は、装置（納入商品の番号）で Varian の装置に結び付ける。
const SEED_MANUFACTURERS: [(&str, &str); 1] = [("Varian", "VARIAN、バリアン")];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Manufacturer {
    pub id: i64,
    pub name: String,
    /// 報告書に書かれることのある別の表記（「、」かカンマ区切り）
    pub aliases: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: i64,
    pub name: String,
    /// 報告書の「納入商品」などの装置番号
    pub serial_no: String,
    pub manufacturer_id: Option<i64>,
    pub manufacturer_name: String,
    pub modality_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Engineer {
    pub id: i64,
    pub name: String,
    pub name_roman: String,
    pub manufacturer_id: Option<i64>,
    pub manufacturer_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StaffAlias {
    pub id: i64,
    pub user_id: i64,
    pub alias: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReportFile {
    pub id: i64,
    pub file_name: String,
    pub content_type: String,
    pub size: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkReport {
    pub id: i64,
    pub device_id: Option<i64>,
    pub device_name: String,
    pub manufacturer_name: String,
    pub modality_id: Option<i64>,
    pub title: String,
    pub work_type: String,
    pub work_order_no: String,
    pub failure_at: String,
    pub arrival_at: String,
    pub recovery_at: String,
    pub departure_at: String,
    pub work_content: String,
    pub notes: String,
    pub engineer_ids: Vec<i64>,
    pub engineer_names: Vec<String>,
    pub staff_user_id: Option<i64>,
    pub staff_name: String,
    /// 取り込んだ報告書に書かれていた担当技師の名前（例: Tsuzuki Shoya）
    pub staff_name_raw: String,
    pub status: String,
    pub source: String,
    pub source_file: String,
    pub created_at: String,
    pub updated_at: String,
    pub updated_by: String,
    pub files: Vec<ReportFile>,
}

/// 画面から保存するときの中身。
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ReportInput {
    pub device_id: Option<i64>,
    pub title: String,
    pub work_type: String,
    pub work_order_no: String,
    pub failure_at: String,
    pub arrival_at: String,
    pub recovery_at: String,
    pub departure_at: String,
    pub work_content: String,
    pub notes: String,
    pub engineer_ids: Vec<i64>,
    pub staff_user_id: Option<i64>,
    pub status: String,
}

/// PDF や JSON（スマホで撮った報告書を Claude で読み取ったもの）から取り出した中身。
#[derive(Debug, Clone, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ParsedReport {
    pub manufacturer: String,
    pub device_name: String,
    pub device_serial: String,
    pub title: String,
    pub work_type: String,
    pub work_order_no: String,
    pub failure_at: String,
    pub arrival_at: String,
    pub recovery_at: String,
    pub departure_at: String,
    pub work_content: String,
    pub notes: String,
    pub engineers: Vec<String>,
    pub staff_name: String,
}

/// 担当技師の候補（担当者一覧の人）。
#[derive(Debug, Clone)]
pub struct StaffCandidate {
    pub id: i64,
    pub last_name: String,
    pub first_name: String,
}

impl StaffCandidate {
    pub fn display_name(&self) -> String {
        format!("{} {}", self.last_name, self.first_name)
    }
}

/// 添付ファイル（取り込んだ PDF・写真）。
#[derive(Debug, Clone)]
pub struct NewFile {
    pub name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    /// created: 登録した / duplicate: 同じ作業指示番号の報告書が登録済み
    pub status: String,
    pub report_id: i64,
    pub message: String,
    /// 読み取れなかった項目など、確認してほしいこと
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReportFilter {
    pub keyword: Option<String>,
    pub device_id: Option<i64>,
    pub status: Option<String>,
}

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn db_error(error: rusqlite::Error) -> String {
    error.to_string()
}

pub fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(get_work_report_db_path()).map_err(db_error)?;
    let _ = conn.busy_timeout(Duration::from_secs(5));
    let _ = conn.execute("PRAGMA foreign_keys = ON;", []);
    Ok(conn)
}

pub fn init_db() -> rusqlite::Result<()> {
    let conn = Connection::open(get_work_report_db_path())?;
    conn.query_row("PRAGMA journal_mode = WAL;", [], |_| Ok(()))?;
    conn.execute("PRAGMA foreign_keys = ON;", [])?;
    init_tables(&conn)
}

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS wr_manufacturers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            aliases TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS wr_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            serial_no TEXT NOT NULL DEFAULT '',
            manufacturer_id INTEGER REFERENCES wr_manufacturers (id) ON DELETE SET NULL,
            modality_id INTEGER,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS wr_engineers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            name_roman TEXT NOT NULL DEFAULT '',
            manufacturer_id INTEGER REFERENCES wr_manufacturers (id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS wr_staff_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            alias TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS work_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id INTEGER REFERENCES wr_devices (id) ON DELETE SET NULL,
            title TEXT NOT NULL DEFAULT '',
            work_type TEXT NOT NULL DEFAULT '',
            work_order_no TEXT NOT NULL DEFAULT '',
            failure_at TEXT NOT NULL DEFAULT '',
            arrival_at TEXT NOT NULL DEFAULT '',
            recovery_at TEXT NOT NULL DEFAULT '',
            departure_at TEXT NOT NULL DEFAULT '',
            work_content TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            staff_user_id INTEGER,
            staff_name TEXT NOT NULL DEFAULT '',
            staff_name_raw TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'review',
            source TEXT NOT NULL DEFAULT 'manual',
            source_file TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL DEFAULT ''
        );
        CREATE UNIQUE INDEX IF NOT EXISTS work_reports_work_order_no
            ON work_reports (work_order_no) WHERE work_order_no <> '';
        CREATE TABLE IF NOT EXISTS work_report_engineers (
            report_id INTEGER NOT NULL REFERENCES work_reports (id) ON DELETE CASCADE,
            engineer_id INTEGER NOT NULL REFERENCES wr_engineers (id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            PRIMARY KEY (report_id, engineer_id)
        );
        CREATE TABLE IF NOT EXISTS work_report_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES work_reports (id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            data BLOB NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS wr_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )?;
    // 最初のメーカーは 1 回だけ入れる（消されたあとに戻さない）。
    let seeded: i64 = conn.query_row(
        "SELECT COUNT(*) FROM wr_meta WHERE key = 'seeded'",
        [],
        |row| row.get(0),
    )?;
    if seeded == 0 {
        for (name, aliases) in SEED_MANUFACTURERS {
            conn.execute(
                "INSERT OR IGNORE INTO wr_manufacturers (name, aliases, created_at) VALUES (?1, ?2, ?3)",
                params![name, aliases, now_str()],
            )?;
        }
        conn.execute(
            "INSERT INTO wr_meta (key, value) VALUES ('seeded', '1')",
            [],
        )?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 名前の照合

/// 名前を比べるための形。空白の位置・大文字小文字・姓名の順番の違いを吸収する。
fn name_keys(value: &str) -> Vec<String> {
    let tokens: Vec<String> = value
        .split(|c: char| c.is_whitespace() || c == '・' || c == ',' || c == '、')
        .filter(|token| !token.is_empty())
        .map(|token| token.to_lowercase())
        .collect();
    if tokens.is_empty() {
        return Vec::new();
    }
    let forward = tokens.concat();
    let backward: String = tokens.iter().rev().map(String::as_str).collect();
    if forward == backward {
        vec![forward]
    } else {
        vec![forward, backward]
    }
}

pub fn names_match(a: &str, b: &str) -> bool {
    let keys_b = name_keys(b);
    name_keys(a).iter().any(|key| keys_b.contains(key))
}

fn split_aliases(aliases: &str) -> impl Iterator<Item = &str> {
    aliases
        .split(['、', ',', '，', '\n'])
        .map(str::trim)
        .filter(|alias| !alias.is_empty())
}

fn compact(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}

// ---------------------------------------------------------------------------
// 入力の整え方

fn text(value: &str, label: &str, limit: usize) -> Result<String, String> {
    let value = value.trim().replace("\r\n", "\n");
    if value.chars().count() > limit {
        return Err(format!("{label}は {limit} 文字以内で入力してください"));
    }
    Ok(value)
}

fn required(value: &str, label: &str) -> Result<String, String> {
    let value = text(value, label, SHORT_LIMIT)?;
    if value.is_empty() {
        return Err(format!("{label}を入力してください"));
    }
    Ok(value)
}

/// `2026/11/09 8:50`・`2026-11-09T08:50` などを `2026-11-09 08:50` にそろえる。空なら空。
pub fn normalize_datetime(raw: &str, label: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    let value = value.replace('T', " ").replace('/', "-");
    let mut parts = value.split_whitespace();
    let date = parts.next().unwrap_or_default();
    let time = parts.next().unwrap_or("00:00");
    let invalid = || format!("{label}の日時が読めません（{raw}）");
    let date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| invalid())?;
    let time = chrono::NaiveTime::parse_from_str(time, "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(time, "%H:%M:%S"))
        .map_err(|_| invalid())?;
    Ok(format!(
        "{} {}",
        date.format("%Y-%m-%d"),
        time.format("%H:%M")
    ))
}

// ---------------------------------------------------------------------------
// メーカー

pub fn list_manufacturers(conn: &Connection) -> Result<Vec<Manufacturer>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, aliases FROM wr_manufacturers ORDER BY name COLLATE NOCASE")
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Manufacturer {
                id: row.get(0)?,
                name: row.get(1)?,
                aliases: row.get(2)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn unique_error(error: rusqlite::Error, message: &str) -> String {
    if error.to_string().contains("UNIQUE") {
        message.to_string()
    } else {
        error.to_string()
    }
}

pub fn save_manufacturer(
    conn: &Connection,
    id: Option<i64>,
    name: &str,
    aliases: &str,
) -> Result<i64, String> {
    let name = required(name, "メーカー名")?;
    let aliases = text(aliases, "別の表記", SHORT_LIMIT)?;
    let duplicate = "同じ名前のメーカーがすでにあります";
    match id {
        Some(id) => {
            conn.execute(
                "UPDATE wr_manufacturers SET name = ?1, aliases = ?2 WHERE id = ?3",
                params![name, aliases, id],
            )
            .map_err(|error| unique_error(error, duplicate))?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO wr_manufacturers (name, aliases, created_at) VALUES (?1, ?2, ?3)",
                params![name, aliases, now_str()],
            )
            .map_err(|error| unique_error(error, duplicate))?;
            Ok(conn.last_insert_rowid())
        }
    }
}

pub fn delete_manufacturer(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM wr_manufacturers WHERE id = ?1", params![id])
        .map_err(db_error)?;
    Ok(())
}

/// 名前か別の表記が一致するメーカーを探す。
fn find_manufacturer(conn: &Connection, name: &str) -> Result<Option<i64>, String> {
    let key = compact(name);
    if key.is_empty() {
        return Ok(None);
    }
    Ok(list_manufacturers(conn)?
        .into_iter()
        .find(|item| {
            compact(&item.name) == key
                || split_aliases(&item.aliases).any(|alias| compact(alias) == key)
        })
        .map(|item| item.id))
}

fn find_or_create_manufacturer(conn: &Connection, name: &str) -> Result<Option<i64>, String> {
    if let Some(id) = find_manufacturer(conn, name)? {
        return Ok(Some(id));
    }
    let name = name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    save_manufacturer(conn, None, name, "").map(Some)
}

// ---------------------------------------------------------------------------
// 装置

pub fn list_devices(conn: &Connection) -> Result<Vec<Device>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.name, d.serial_no, d.manufacturer_id, COALESCE(m.name, ''), d.modality_id
             FROM wr_devices d LEFT JOIN wr_manufacturers m ON m.id = d.manufacturer_id
             ORDER BY COALESCE(m.name, '') COLLATE NOCASE, d.name COLLATE NOCASE, d.id",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Device {
                id: row.get(0)?,
                name: row.get(1)?,
                serial_no: row.get(2)?,
                manufacturer_id: row.get(3)?,
                manufacturer_name: row.get(4)?,
                modality_id: row.get(5)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DeviceInput {
    pub name: String,
    pub serial_no: String,
    pub manufacturer_id: Option<i64>,
    pub modality_id: Option<i64>,
}

pub fn save_device(conn: &Connection, id: Option<i64>, input: &DeviceInput) -> Result<i64, String> {
    let name = required(&input.name, "装置名")?;
    let serial_no = text(&input.serial_no, "装置番号", SHORT_LIMIT)?;
    if !serial_no.is_empty() {
        let other: Option<i64> = conn
            .query_row(
                "SELECT id FROM wr_devices WHERE lower(serial_no) = lower(?1) AND id <> ?2",
                params![serial_no, id.unwrap_or(0)],
                |row| row.get(0),
            )
            .optional()
            .map_err(db_error)?;
        if other.is_some() {
            return Err(format!("装置番号 {serial_no} の装置がすでにあります"));
        }
    }
    match id {
        Some(id) => {
            conn.execute(
                "UPDATE wr_devices SET name = ?1, serial_no = ?2, manufacturer_id = ?3, modality_id = ?4 WHERE id = ?5",
                params![name, serial_no, input.manufacturer_id, input.modality_id, id],
            )
            .map_err(db_error)?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO wr_devices (name, serial_no, manufacturer_id, modality_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    name,
                    serial_no,
                    input.manufacturer_id,
                    input.modality_id,
                    now_str()
                ],
            )
            .map_err(db_error)?;
            Ok(conn.last_insert_rowid())
        }
    }
}

pub fn delete_device(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM wr_devices WHERE id = ?1", params![id])
        .map_err(db_error)?;
    Ok(())
}

/// 装置番号（なければ装置名）で装置を探し、なければ登録する。
fn find_or_create_device(
    conn: &Connection,
    manufacturer: &str,
    name: &str,
    serial: &str,
    warnings: &mut Vec<String>,
) -> Result<Option<i64>, String> {
    let devices = list_devices(conn)?;
    let serial_key = compact(serial);
    let name_key = compact(name);
    if !serial_key.is_empty() {
        if let Some(device) = devices.iter().find(|d| compact(&d.serial_no) == serial_key) {
            return Ok(Some(device.id));
        }
    } else if !name_key.is_empty() {
        if let Some(device) = devices.iter().find(|d| compact(&d.name) == name_key) {
            return Ok(Some(device.id));
        }
    }
    if serial_key.is_empty() && name_key.is_empty() {
        warnings.push("装置が読み取れませんでした".into());
        return Ok(None);
    }
    let manufacturer_id = find_or_create_manufacturer(conn, manufacturer)?;
    let display = if name.trim().is_empty() { serial } else { name };
    let id = save_device(
        conn,
        None,
        &DeviceInput {
            name: display.trim().to_string(),
            serial_no: serial.trim().to_string(),
            manufacturer_id,
            modality_id: None,
        },
    )?;
    warnings.push(format!("装置「{}」を新しく登録しました", display.trim()));
    Ok(Some(id))
}

// ---------------------------------------------------------------------------
// 作業担当者（メーカー側）

pub fn list_engineers(conn: &Connection) -> Result<Vec<Engineer>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.name, e.name_roman, e.manufacturer_id, COALESCE(m.name, '')
             FROM wr_engineers e LEFT JOIN wr_manufacturers m ON m.id = e.manufacturer_id
             ORDER BY COALESCE(m.name, '') COLLATE NOCASE, e.name, e.id",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Engineer {
                id: row.get(0)?,
                name: row.get(1)?,
                name_roman: row.get(2)?,
                manufacturer_id: row.get(3)?,
                manufacturer_name: row.get(4)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct EngineerInput {
    pub name: String,
    pub name_roman: String,
    pub manufacturer_id: Option<i64>,
}

pub fn save_engineer(
    conn: &Connection,
    id: Option<i64>,
    input: &EngineerInput,
) -> Result<i64, String> {
    let name = crate::work_report::pdf::collapse_spaces(&required(&input.name, "氏名")?);
    let name_roman = text(&input.name_roman, "ローマ字", SHORT_LIMIT)?;
    match id {
        Some(id) => {
            conn.execute(
                "UPDATE wr_engineers SET name = ?1, name_roman = ?2, manufacturer_id = ?3 WHERE id = ?4",
                params![name, name_roman, input.manufacturer_id, id],
            )
            .map_err(db_error)?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO wr_engineers (name, name_roman, manufacturer_id, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![name, name_roman, input.manufacturer_id, now_str()],
            )
            .map_err(db_error)?;
            Ok(conn.last_insert_rowid())
        }
    }
}

pub fn delete_engineer(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM wr_engineers WHERE id = ?1", params![id])
        .map_err(db_error)?;
    Ok(())
}

fn engineer_matches(engineer: &Engineer, name: &str) -> bool {
    names_match(&engineer.name, name)
        || (!engineer.name_roman.is_empty() && names_match(&engineer.name_roman, name))
}

/// 報告書の名前に当たる作業担当者を探し、いなければ登録する。
fn find_or_create_engineer(
    conn: &Connection,
    name: &str,
    manufacturer_id: Option<i64>,
    warnings: &mut Vec<String>,
) -> Result<Option<i64>, String> {
    let name = crate::work_report::pdf::collapse_spaces(name);
    if name.is_empty() {
        return Ok(None);
    }
    let engineers = list_engineers(conn)?;
    let found = engineers
        .iter()
        .filter(|e| engineer_matches(e, &name))
        .min_by_key(|e| e.manufacturer_id != manufacturer_id);
    if let Some(engineer) = found {
        return Ok(Some(engineer.id));
    }
    let id = save_engineer(
        conn,
        None,
        &EngineerInput {
            name: name.clone(),
            name_roman: String::new(),
            manufacturer_id,
        },
    )?;
    warnings.push(format!("作業担当者「{name}」を新しく登録しました"));
    Ok(Some(id))
}

/// 連絡事項の「共同作業者：東」から、登録済みの作業担当者を探す（姓だけでも、1 人に決まれば使う）。
fn co_workers(
    conn: &Connection,
    notes: &str,
    manufacturer_id: Option<i64>,
) -> Result<Vec<i64>, String> {
    let Some(start) = notes.find("共同作業者") else {
        return Ok(Vec::new());
    };
    let rest = &notes[start + "共同作業者".len()..];
    let rest = rest.trim_start_matches([':', '：', ' ', '　']);
    let line = rest.lines().next().unwrap_or_default();
    let engineers = list_engineers(conn)?;
    let mut ids = Vec::new();
    for name in line.split(['、', ',', '，', '/', '・']).map(str::trim) {
        if name.is_empty() {
            continue;
        }
        let candidates: Vec<&Engineer> = engineers
            .iter()
            .filter(|e| manufacturer_id.is_none() || e.manufacturer_id == manufacturer_id)
            .filter(|e| engineer_matches(e, name) || e.name.split_whitespace().next() == Some(name))
            .collect();
        if let [only] = candidates.as_slice() {
            ids.push(only.id);
        }
    }
    Ok(ids)
}

// ---------------------------------------------------------------------------
// 担当技師（院内の担当者）の別表記

pub fn list_staff_aliases(conn: &Connection) -> Result<Vec<StaffAlias>, String> {
    let mut stmt = conn
        .prepare("SELECT id, user_id, alias FROM wr_staff_aliases ORDER BY user_id, id")
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StaffAlias {
                id: row.get(0)?,
                user_id: row.get(1)?,
                alias: row.get(2)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn add_staff_alias(conn: &Connection, user_id: i64, alias: &str) -> Result<(), String> {
    let alias = crate::work_report::pdf::collapse_spaces(&required(alias, "表記")?);
    let exists = list_staff_aliases(conn)?
        .iter()
        .any(|item| item.user_id == user_id && names_match(&item.alias, &alias));
    if !exists {
        conn.execute(
            "INSERT INTO wr_staff_aliases (user_id, alias, created_at) VALUES (?1, ?2, ?3)",
            params![user_id, alias, now_str()],
        )
        .map_err(db_error)?;
    }
    Ok(())
}

pub fn delete_staff_alias(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM wr_staff_aliases WHERE id = ?1", params![id])
        .map_err(db_error)?;
    Ok(())
}

/// 報告書に書かれた名前（漢字でもローマ字でも）に当たる担当者を探す。
pub fn find_staff(
    conn: &Connection,
    name: &str,
    staff: &[StaffCandidate],
) -> Result<Option<i64>, String> {
    if name.trim().is_empty() {
        return Ok(None);
    }
    if let Some(person) = staff
        .iter()
        .find(|person| names_match(&person.display_name(), name))
    {
        return Ok(Some(person.id));
    }
    let aliases = list_staff_aliases(conn)?;
    Ok(aliases
        .iter()
        .find(|item| names_match(&item.alias, name) && staff.iter().any(|p| p.id == item.user_id))
        .map(|item| item.user_id))
}

// ---------------------------------------------------------------------------
// 作業報告書

const REPORT_COLUMNS: &str = "r.id, r.device_id, COALESCE(d.name, ''), COALESCE(m.name, ''), d.modality_id,
    r.title, r.work_type, r.work_order_no, r.failure_at, r.arrival_at, r.recovery_at, r.departure_at,
    r.work_content, r.notes, r.staff_user_id, r.staff_name, r.staff_name_raw, r.status, r.source,
    r.source_file, r.created_at, r.updated_at, r.updated_by";
const REPORT_FROM: &str = "FROM work_reports r
    LEFT JOIN wr_devices d ON d.id = r.device_id
    LEFT JOIN wr_manufacturers m ON m.id = d.manufacturer_id";

fn map_report(row: &rusqlite::Row) -> rusqlite::Result<WorkReport> {
    Ok(WorkReport {
        id: row.get(0)?,
        device_id: row.get(1)?,
        device_name: row.get(2)?,
        manufacturer_name: row.get(3)?,
        modality_id: row.get(4)?,
        title: row.get(5)?,
        work_type: row.get(6)?,
        work_order_no: row.get(7)?,
        failure_at: row.get(8)?,
        arrival_at: row.get(9)?,
        recovery_at: row.get(10)?,
        departure_at: row.get(11)?,
        work_content: row.get(12)?,
        notes: row.get(13)?,
        engineer_ids: Vec::new(),
        engineer_names: Vec::new(),
        staff_user_id: row.get(14)?,
        staff_name: row.get(15)?,
        staff_name_raw: row.get(16)?,
        status: row.get(17)?,
        source: row.get(18)?,
        source_file: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
        updated_by: row.get(22)?,
        files: Vec::new(),
    })
}

fn attach_engineers(conn: &Connection, report: &mut WorkReport) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.name FROM work_report_engineers re
             JOIN wr_engineers e ON e.id = re.engineer_id
             WHERE re.report_id = ?1 ORDER BY re.position",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![report.id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(db_error)?;
    for row in rows {
        let (id, name) = row.map_err(db_error)?;
        report.engineer_ids.push(id);
        report.engineer_names.push(name);
    }
    Ok(())
}

fn report_files(conn: &Connection, report_id: i64) -> Result<Vec<ReportFile>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, file_name, content_type, size, created_at FROM work_report_files
             WHERE report_id = ?1 ORDER BY id",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![report_id], |row| {
            Ok(ReportFile {
                id: row.get(0)?,
                file_name: row.get(1)?,
                content_type: row.get(2)?,
                size: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn list_reports(conn: &Connection, filter: &ReportFilter) -> Result<Vec<WorkReport>, String> {
    let mut sql = format!("SELECT {REPORT_COLUMNS} {REPORT_FROM} WHERE 1 = 1");
    let mut values: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(device_id) = filter.device_id {
        sql.push_str(" AND r.device_id = ?");
        values.push(device_id.into());
    }
    if let Some(status) = filter.status.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND r.status = ?");
        values.push(status.to_string().into());
    }
    let keyword = filter.keyword.as_deref().unwrap_or("").trim();
    if !keyword.is_empty() {
        sql.push_str(
            " AND (r.title LIKE ? OR r.work_content LIKE ? OR r.notes LIKE ? OR r.work_order_no LIKE ?
               OR r.work_type LIKE ? OR r.staff_name LIKE ? OR d.name LIKE ?
               OR EXISTS (SELECT 1 FROM work_report_engineers re JOIN wr_engineers e ON e.id = re.engineer_id
                          WHERE re.report_id = r.id AND (e.name LIKE ? OR e.name_roman LIKE ?)))",
        );
        let like = format!("%{keyword}%");
        for _ in 0..9 {
            values.push(like.clone().into());
        }
    }
    sql.push_str(
        " ORDER BY COALESCE(NULLIF(r.failure_at, ''), NULLIF(r.arrival_at, ''), r.created_at) DESC, r.id DESC",
    );
    let mut stmt = conn.prepare(&sql).map_err(db_error)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(values), map_report)
        .map_err(db_error)?;
    let mut reports = rows.collect::<Result<Vec<_>, _>>().map_err(db_error)?;
    for report in &mut reports {
        attach_engineers(conn, report)?;
    }
    Ok(reports)
}

pub fn get_report(conn: &Connection, id: i64) -> Result<WorkReport, String> {
    let mut report = conn
        .query_row(
            &format!("SELECT {REPORT_COLUMNS} {REPORT_FROM} WHERE r.id = ?1"),
            params![id],
            map_report,
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "作業報告書が見つかりません".to_string())?;
    attach_engineers(conn, &mut report)?;
    report.files = report_files(conn, id)?;
    Ok(report)
}

struct CleanInput {
    device_id: Option<i64>,
    title: String,
    work_type: String,
    work_order_no: String,
    failure_at: String,
    arrival_at: String,
    recovery_at: String,
    departure_at: String,
    work_content: String,
    notes: String,
    engineer_ids: Vec<i64>,
    staff_user_id: Option<i64>,
    staff_name: String,
    status: String,
}

fn clean_input(input: &ReportInput, staff: &[StaffCandidate]) -> Result<CleanInput, String> {
    let status = if input.status.is_empty() {
        STATUS_REVIEW.to_string()
    } else {
        input.status.clone()
    };
    if !STATUSES.contains(&status.as_str()) {
        return Err("状態の指定が正しくありません".into());
    }
    let staff_name = match input.staff_user_id {
        Some(id) => staff
            .iter()
            .find(|person| person.id == id)
            .map(StaffCandidate::display_name)
            .ok_or_else(|| "担当技師が担当者一覧に見つかりません".to_string())?,
        None => String::new(),
    };
    let mut engineer_ids: Vec<i64> = Vec::new();
    for id in &input.engineer_ids {
        if !engineer_ids.contains(id) {
            engineer_ids.push(*id);
        }
    }
    Ok(CleanInput {
        device_id: input.device_id,
        title: text(&input.title, "件名", SHORT_LIMIT)?,
        work_type: text(&input.work_type, "作業区分", SHORT_LIMIT)?,
        work_order_no: normalize_order_no(&text(
            &input.work_order_no,
            "作業指示番号",
            SHORT_LIMIT,
        )?),
        failure_at: normalize_datetime(&input.failure_at, "障害発生日時")?,
        arrival_at: normalize_datetime(&input.arrival_at, "到着日時")?,
        recovery_at: normalize_datetime(&input.recovery_at, "装置復帰")?,
        departure_at: normalize_datetime(&input.departure_at, "退出日時")?,
        work_content: text(&input.work_content, "作業内容", LONG_LIMIT)?,
        notes: text(&input.notes, "連絡事項", LONG_LIMIT)?,
        engineer_ids,
        staff_user_id: input.staff_user_id,
        staff_name,
        status,
    })
}

fn write_engineers(conn: &Connection, report_id: i64, ids: &[i64]) -> Result<(), String> {
    conn.execute(
        "DELETE FROM work_report_engineers WHERE report_id = ?1",
        params![report_id],
    )
    .map_err(db_error)?;
    for (position, id) in ids.iter().enumerate() {
        conn.execute(
            "INSERT INTO work_report_engineers (report_id, engineer_id, position) VALUES (?1, ?2, ?3)",
            params![report_id, id, position as i64],
        )
        .map_err(|_| "作業担当者が一覧に見つかりません".to_string())?;
    }
    Ok(())
}

/// 作業指示番号を比べやすい形にそろえる（空白を取り、全角英数字を半角に、英字を大文字にする）。
pub fn normalize_order_no(raw: &str) -> String {
    raw.chars()
        .filter(|c| !c.is_whitespace())
        .map(|c| match c {
            '\u{FF01}'..='\u{FF5E}' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
            'ー' | '―' | '‐' => '-',
            _ => c,
        })
        .collect::<String>()
        .to_uppercase()
}

/// すでに登録されている同じ作業報告書。
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Duplicate {
    pub id: i64,
    pub title: String,
    pub failure_at: String,
    pub work_order_no: String,
    /// 同じと判断した理由
    pub reason: String,
}

impl Duplicate {
    pub fn message(&self) -> String {
        let title = if self.title.is_empty() {
            "件名なし".to_string()
        } else {
            self.title.clone()
        };
        let when = if self.failure_at.is_empty() {
            String::new()
        } else {
            format!("{} ", self.failure_at.replace('-', "/"))
        };
        format!(
            "この作業報告書は登録済みです（{}。登録済み: {when}「{title}」）",
            self.reason
        )
    }
}

/// 同じ作業報告書がすでにあるか調べる。
///
/// 1. 作業指示番号が同じ（空白・全角半角・大文字小文字の違いは無視）
/// 2. 作業指示番号がどちらかで空のときは、装置・障害発生日時・到着日時がすべて同じ
///    （同じ障害で別の日に来た作業は作業指示番号が違うので、番号があるもの同士は 1 だけで判断する）
pub fn find_duplicate(
    conn: &Connection,
    exclude_id: Option<i64>,
    work_order_no: &str,
    device_id: Option<i64>,
    failure_at: &str,
    arrival_at: &str,
) -> Result<Option<Duplicate>, String> {
    let order_no = normalize_order_no(work_order_no);
    let exclude = exclude_id.unwrap_or(0);
    let map = |reason: String| {
        move |row: &rusqlite::Row| -> rusqlite::Result<Duplicate> {
            Ok(Duplicate {
                id: row.get(0)?,
                title: row.get(1)?,
                failure_at: row.get(2)?,
                work_order_no: row.get(3)?,
                reason: reason.clone(),
            })
        }
    };
    if !order_no.is_empty() {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, failure_at, work_order_no FROM work_reports
                 WHERE work_order_no <> '' AND id <> ?1 ORDER BY id",
            )
            .map_err(db_error)?;
        let rows = stmt
            .query_map(
                params![exclude],
                map(format!("作業指示番号 {order_no} が同じです")),
            )
            .map_err(db_error)?;
        for row in rows {
            let row = row.map_err(db_error)?;
            if normalize_order_no(&row.work_order_no) == order_no {
                return Ok(Some(row));
            }
        }
    }
    let (Some(device_id), false, false) = (device_id, failure_at.is_empty(), arrival_at.is_empty())
    else {
        return Ok(None);
    };
    conn.query_row(
        "SELECT id, title, failure_at, work_order_no FROM work_reports
         WHERE device_id = ?1 AND failure_at = ?2 AND arrival_at = ?3 AND id <> ?4
           AND (?5 = '' OR work_order_no = '')
         ORDER BY id LIMIT 1",
        params![device_id, failure_at, arrival_at, exclude, order_no],
        map("装置・障害発生日時・到着日時が同じです".into()),
    )
    .optional()
    .map_err(db_error)
}

fn duplicate_order_message(error: rusqlite::Error) -> String {
    unique_error(
        error,
        "同じ作業指示番号の作業報告書がすでに登録されています",
    )
}

fn reject_duplicate(
    conn: &Connection,
    exclude_id: Option<i64>,
    clean: &CleanInput,
) -> Result<(), String> {
    match find_duplicate(
        conn,
        exclude_id,
        &clean.work_order_no,
        clean.device_id,
        &clean.failure_at,
        &clean.arrival_at,
    )? {
        Some(duplicate) => Err(duplicate.message()),
        None => Ok(()),
    }
}

pub fn create_report(
    conn: &mut Connection,
    input: &ReportInput,
    staff: &[StaffCandidate],
    actor: &str,
) -> Result<i64, String> {
    let clean = clean_input(input, staff)?;
    reject_duplicate(conn, None, &clean)?;
    let tx = conn.transaction().map_err(db_error)?;
    let now = now_str();
    tx.execute(
        "INSERT INTO work_reports (
            device_id, title, work_type, work_order_no, failure_at, arrival_at, recovery_at,
            departure_at, work_content, notes, staff_user_id, staff_name, status, source,
            created_at, updated_at, updated_by
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'manual', ?14, ?14, ?15)",
        params![
            clean.device_id,
            clean.title,
            clean.work_type,
            clean.work_order_no,
            clean.failure_at,
            clean.arrival_at,
            clean.recovery_at,
            clean.departure_at,
            clean.work_content,
            clean.notes,
            clean.staff_user_id,
            clean.staff_name,
            clean.status,
            now,
            actor,
        ],
    )
    .map_err(duplicate_order_message)?;
    let id = tx.last_insert_rowid();
    write_engineers(&tx, id, &clean.engineer_ids)?;
    tx.commit().map_err(db_error)?;
    Ok(id)
}

pub fn update_report(
    conn: &mut Connection,
    id: i64,
    input: &ReportInput,
    staff: &[StaffCandidate],
    actor: &str,
) -> Result<(), String> {
    let clean = clean_input(input, staff)?;
    reject_duplicate(conn, Some(id), &clean)?;
    let tx = conn.transaction().map_err(db_error)?;
    let raw: String = tx
        .query_row(
            "SELECT staff_name_raw FROM work_reports WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "作業報告書が見つかりません".to_string())?;
    tx.execute(
        "UPDATE work_reports SET
            device_id = ?1, title = ?2, work_type = ?3, work_order_no = ?4, failure_at = ?5,
            arrival_at = ?6, recovery_at = ?7, departure_at = ?8, work_content = ?9, notes = ?10,
            staff_user_id = ?11, staff_name = ?12, status = ?13, updated_at = ?14, updated_by = ?15
         WHERE id = ?16",
        params![
            clean.device_id,
            clean.title,
            clean.work_type,
            clean.work_order_no,
            clean.failure_at,
            clean.arrival_at,
            clean.recovery_at,
            clean.departure_at,
            clean.work_content,
            clean.notes,
            clean.staff_user_id,
            clean.staff_name,
            clean.status,
            now_str(),
            actor,
            id,
        ],
    )
    .map_err(duplicate_order_message)?;
    write_engineers(&tx, id, &clean.engineer_ids)?;
    // 取り込んだ報告書の担当技師の表記（例: Tsuzuki Shoya）を覚え、次からは自動で選ぶ。
    if let Some(user_id) = clean.staff_user_id {
        if !raw.trim().is_empty() && !names_match(&raw, &clean.staff_name) {
            add_staff_alias(&tx, user_id, &raw)?;
        }
    }
    tx.commit().map_err(db_error)?;
    Ok(())
}

pub fn delete_report(conn: &Connection, id: i64) -> Result<(), String> {
    let deleted = conn
        .execute("DELETE FROM work_reports WHERE id = ?1", params![id])
        .map_err(db_error)?;
    if deleted == 0 {
        return Err("作業報告書が見つかりません".into());
    }
    Ok(())
}

pub fn content_type_for(name: &str) -> &'static str {
    let ext = name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "pdf" => "application/pdf",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "json" => "application/json",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

pub fn add_file(conn: &Connection, report_id: i64, file: &NewFile) -> Result<i64, String> {
    let name = file.name.trim();
    let name = if name.is_empty() {
        "添付ファイル"
    } else {
        name
    };
    if file.bytes.is_empty() {
        return Err("空のファイルは添付できません".into());
    }
    conn.execute(
        "INSERT INTO work_report_files (report_id, file_name, content_type, size, data, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            report_id,
            name,
            content_type_for(name),
            file.bytes.len() as i64,
            file.bytes,
            now_str()
        ],
    )
    .map_err(|error| {
        if error.to_string().contains("FOREIGN KEY") {
            "作業報告書が見つかりません".to_string()
        } else {
            error.to_string()
        }
    })?;
    Ok(conn.last_insert_rowid())
}

pub fn get_file(conn: &Connection, id: i64) -> Result<(ReportFile, Vec<u8>), String> {
    conn.query_row(
        "SELECT id, file_name, content_type, size, created_at, data FROM work_report_files WHERE id = ?1",
        params![id],
        |row| {
            Ok((
                ReportFile {
                    id: row.get(0)?,
                    file_name: row.get(1)?,
                    content_type: row.get(2)?,
                    size: row.get(3)?,
                    created_at: row.get(4)?,
                },
                row.get(5)?,
            ))
        },
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| "ファイルが見つかりません".to_string())
}

pub fn delete_file(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM work_report_files WHERE id = ?1", params![id])
        .map_err(db_error)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 取り込み

/// 読み取った報告書を「要確認」として登録する。同じ作業指示番号があれば登録しない。
pub fn import_parsed(
    conn: &mut Connection,
    parsed: &ParsedReport,
    source: &str,
    source_file: &str,
    files: &[NewFile],
    staff: &[StaffCandidate],
    actor: &str,
) -> Result<ImportResult, String> {
    let work_order_no =
        normalize_order_no(&text(&parsed.work_order_no, "作業指示番号", SHORT_LIMIT)?);
    let duplicate_result = |duplicate: Duplicate| ImportResult {
        status: "duplicate".into(),
        report_id: duplicate.id,
        message: duplicate.message(),
        warnings: Vec::new(),
    };
    if let Some(duplicate) = find_duplicate(conn, None, &work_order_no, None, "", "")? {
        return Ok(duplicate_result(duplicate));
    }

    let mut warnings = Vec::new();
    let tx = conn.transaction().map_err(db_error)?;
    let device_id = find_or_create_device(
        &tx,
        &parsed.manufacturer,
        &parsed.device_name,
        &parsed.device_serial,
        &mut warnings,
    )?;
    let manufacturer_id: Option<i64> = match device_id {
        Some(id) => tx
            .query_row(
                "SELECT manufacturer_id FROM wr_devices WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(db_error)?,
        None => find_manufacturer(&tx, &parsed.manufacturer)?,
    };

    let mut engineer_ids = Vec::new();
    for name in &parsed.engineers {
        if let Some(id) = find_or_create_engineer(&tx, name, manufacturer_id, &mut warnings)? {
            if !engineer_ids.contains(&id) {
                engineer_ids.push(id);
            }
        }
    }
    for id in co_workers(&tx, &parsed.notes, manufacturer_id)? {
        if !engineer_ids.contains(&id) {
            engineer_ids.push(id);
        }
    }
    if engineer_ids.is_empty() {
        warnings.push("作業担当者が読み取れませんでした".into());
    }

    let staff_name_raw = crate::work_report::pdf::collapse_spaces(&parsed.staff_name);
    let staff_user_id = find_staff(&tx, &staff_name_raw, staff)?;
    let staff_name = staff_user_id
        .and_then(|id| staff.iter().find(|p| p.id == id))
        .map(StaffCandidate::display_name)
        .unwrap_or_default();
    if staff_user_id.is_none() {
        if staff_name_raw.is_empty() {
            warnings.push("担当技師が読み取れませんでした".into());
        } else {
            warnings.push(format!(
                "担当技師「{staff_name_raw}」が担当者一覧の誰か分かりませんでした。選んで保存すると、次からは自動で選びます"
            ));
        }
    }

    let mut datetime = |raw: &str, label: &str| match normalize_datetime(raw, label) {
        Ok(value) => {
            if value.is_empty() {
                warnings.push(format!("{label}が読み取れませんでした"));
            }
            value
        }
        Err(message) => {
            warnings.push(message);
            String::new()
        }
    };
    let failure_at = datetime(&parsed.failure_at, "障害発生日時");
    let arrival_at = datetime(&parsed.arrival_at, "到着日時");
    let recovery_at = datetime(&parsed.recovery_at, "装置復帰");
    let departure_at = datetime(&parsed.departure_at, "退出日時");

    // 作業指示番号がないとき（写真から読み取れなかったなど）は、装置と日時で同じ報告書を探す。
    // 見つかったら、自動で登録した装置・作業担当者も含めて取り消す（tx を commit しない）。
    if let Some(duplicate) = find_duplicate(
        &tx,
        None,
        &work_order_no,
        device_id,
        &failure_at,
        &arrival_at,
    )? {
        return Ok(duplicate_result(duplicate));
    }

    let now = now_str();
    tx.execute(
        "INSERT INTO work_reports (
            device_id, title, work_type, work_order_no, failure_at, arrival_at, recovery_at,
            departure_at, work_content, notes, staff_user_id, staff_name, staff_name_raw, status,
            source, source_file, created_at, updated_at, updated_by
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'review', ?14, ?15, ?16, ?16, ?17)",
        params![
            device_id,
            text(&parsed.title, "件名", SHORT_LIMIT)?,
            text(&parsed.work_type, "作業区分", SHORT_LIMIT)?,
            work_order_no,
            failure_at,
            arrival_at,
            recovery_at,
            departure_at,
            text(&parsed.work_content, "作業内容", LONG_LIMIT)?,
            text(&parsed.notes, "連絡事項", LONG_LIMIT)?,
            staff_user_id,
            staff_name,
            staff_name_raw,
            source,
            source_file,
            now,
            actor,
        ],
    )
    .map_err(duplicate_order_message)?;
    let report_id = tx.last_insert_rowid();
    write_engineers(&tx, report_id, &engineer_ids)?;
    for file in files {
        add_file(&tx, report_id, file)?;
    }
    tx.commit().map_err(db_error)?;
    Ok(ImportResult {
        status: "created".into(),
        report_id,
        message: "要確認として登録しました".into(),
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();
        init_tables(&conn).unwrap();
        conn
    }

    fn staff() -> Vec<StaffCandidate> {
        vec![
            StaffCandidate {
                id: 1,
                last_name: "續".into(),
                first_name: "翔也".into(),
            },
            StaffCandidate {
                id: 2,
                last_name: "山田".into(),
                first_name: "太郎".into(),
            },
        ]
    }

    fn parsed() -> ParsedReport {
        ParsedReport {
            manufacturer: "Varian".into(),
            device_name: "CLINAC IX".into(),
            device_serial: "H295977".into(),
            title: "定期点検Q2".into(),
            work_type: "PMP".into(),
            work_order_no: "WO-1".into(),
            failure_at: "2026/11/09 8:50".into(),
            arrival_at: "2026/11/10 16:30".into(),
            recovery_at: "2026/11/11 19:45".into(),
            departure_at: "2026/11/11 19:45".into(),
            work_content: "定期点検".into(),
            notes: "共同作業者：東".into(),
            engineers: vec!["熊川 雄大".into()],
            staff_name: "Tsuzuki Shoya".into(),
        }
    }

    #[test]
    fn normalizes_datetimes() {
        assert_eq!(
            normalize_datetime("2026/11/09 8:50", "x").unwrap(),
            "2026-11-09 08:50"
        );
        assert_eq!(
            normalize_datetime("2026-11-09T08:50", "x").unwrap(),
            "2026-11-09 08:50"
        );
        assert_eq!(normalize_datetime("", "x").unwrap(), "");
        assert!(normalize_datetime("2026/13/01 8:50", "x").is_err());
    }

    #[test]
    fn matches_names_in_either_order() {
        assert!(names_match("續 翔也", "續　翔也"));
        assert!(names_match("續 翔也", "續翔也"));
        assert!(names_match("Tsuzuki Shoya", "shoya tsuzuki"));
        assert!(!names_match("Tsuzuki Shoya", "續 翔也"));
    }

    #[test]
    fn imports_a_report_and_skips_the_same_work_order() {
        let mut conn = conn();
        // 東さんは前の報告書で登録済み
        save_engineer(
            &conn,
            None,
            &EngineerInput {
                name: "東　尚人".into(),
                name_roman: "Naoto Higashi".into(),
                manufacturer_id: find_manufacturer(&conn, "Varian").unwrap(),
            },
        )
        .unwrap();

        let result = import_parsed(
            &mut conn,
            &parsed(),
            "pdf",
            "a.pdf",
            &[],
            &staff(),
            "テスト",
        )
        .unwrap();
        assert_eq!(result.status, "created");
        let report = get_report(&conn, result.report_id).unwrap();
        assert_eq!(report.device_name, "CLINAC IX");
        assert_eq!(report.manufacturer_name, "Varian");
        assert_eq!(report.failure_at, "2026-11-09 08:50");
        assert_eq!(report.engineer_names, vec!["熊川 雄大", "東 尚人"]);
        assert_eq!(report.status, STATUS_REVIEW);
        // ローマ字の表記はまだ誰か分からない
        assert_eq!(report.staff_user_id, None);
        assert_eq!(report.staff_name_raw, "Tsuzuki Shoya");

        let again = import_parsed(
            &mut conn,
            &parsed(),
            "pdf",
            "a.pdf",
            &[],
            &staff(),
            "テスト",
        )
        .unwrap();
        assert_eq!(again.status, "duplicate");
        assert_eq!(again.report_id, result.report_id);
    }

    #[test]
    fn learns_the_staff_spelling_when_saved() {
        let mut conn = conn();
        let first = import_parsed(
            &mut conn,
            &parsed(),
            "pdf",
            "a.pdf",
            &[],
            &staff(),
            "テスト",
        )
        .unwrap();
        let report = get_report(&conn, first.report_id).unwrap();
        let input = ReportInput {
            device_id: report.device_id,
            engineer_ids: report.engineer_ids.clone(),
            staff_user_id: Some(1),
            status: STATUS_CONFIRMED.into(),
            ..Default::default()
        };
        update_report(&mut conn, first.report_id, &input, &staff(), "テスト").unwrap();
        assert_eq!(
            get_report(&conn, first.report_id).unwrap().staff_name,
            "續 翔也"
        );

        let mut next = parsed();
        next.work_order_no = "WO-2".into();
        next.device_name = "CLINAC-IX".into();
        let second =
            import_parsed(&mut conn, &next, "pdf", "b.pdf", &[], &staff(), "テスト").unwrap();
        let report = get_report(&conn, second.report_id).unwrap();
        assert_eq!(report.staff_user_id, Some(1));
        // 装置名の表記が違っても、装置番号で同じ装置になる
        assert_eq!(
            report.device_id,
            get_report(&conn, first.report_id).unwrap().device_id
        );
        assert_eq!(list_devices(&conn).unwrap().len(), 1);
    }

    #[test]
    fn kanji_staff_names_match_directly() {
        let mut conn = conn();
        let mut report = parsed();
        report.staff_name = "續　翔也".into();
        let result =
            import_parsed(&mut conn, &report, "pdf", "a.pdf", &[], &staff(), "テスト").unwrap();
        assert_eq!(
            get_report(&conn, result.report_id).unwrap().staff_user_id,
            Some(1)
        );
    }

    #[test]
    fn rejects_the_same_report_entered_by_hand() {
        let mut conn = conn();
        let first = import_parsed(
            &mut conn,
            &parsed(),
            "pdf",
            "a.pdf",
            &[],
            &staff(),
            "テスト",
        )
        .unwrap();
        let device_id = get_report(&conn, first.report_id).unwrap().device_id;

        // 空白・全角・小文字の違いがあっても同じ作業指示番号とみなす
        let input = ReportInput {
            work_order_no: " ｗｏ－1 ".into(),
            ..Default::default()
        };
        let error = create_report(&mut conn, &input, &staff(), "テスト").unwrap_err();
        assert!(error.contains("登録済み"), "{error}");
        assert!(error.contains("定期点検Q2"), "{error}");

        // 作業指示番号なしでも、装置・障害発生日時・到着日時が同じなら同じ報告書
        let same_visit = ReportInput {
            device_id,
            failure_at: "2026-11-09 08:50".into(),
            arrival_at: "2026-11-10 16:30".into(),
            ..Default::default()
        };
        assert!(create_report(&mut conn, &same_visit, &staff(), "テスト").is_err());

        // 同じ障害でも、作業指示番号が別なら別の作業として登録できる
        let follow_up = ReportInput {
            work_order_no: "WO-2".into(),
            ..same_visit.clone()
        };
        let id = create_report(&mut conn, &follow_up, &staff(), "テスト").unwrap();
        assert_eq!(get_report(&conn, id).unwrap().work_order_no, "WO-2");

        // 自分自身との重複にはならない（保存し直せる）
        update_report(&mut conn, id, &follow_up, &staff(), "テスト").unwrap();
        // 別の報告書と同じ番号に書き換えることはできない
        let clash = ReportInput {
            work_order_no: "wo-1".into(),
            ..follow_up
        };
        assert!(update_report(&mut conn, id, &clash, &staff(), "テスト").is_err());
    }

    #[test]
    fn rejects_an_import_without_a_work_order_when_the_visit_matches() {
        let mut conn = conn();
        import_parsed(
            &mut conn,
            &parsed(),
            "pdf",
            "a.pdf",
            &[],
            &staff(),
            "テスト",
        )
        .unwrap();
        let mut photo = parsed();
        photo.work_order_no = String::new();
        photo.engineers = vec!["新しい 人".into()];
        let result =
            import_parsed(&mut conn, &photo, "json", "a.json", &[], &staff(), "テスト").unwrap();
        assert_eq!(result.status, "duplicate");
        // 重複と分かった取り込みで、作業担当者を増やさない
        assert!(!list_engineers(&conn)
            .unwrap()
            .iter()
            .any(|e| e.name == "新しい 人"));
    }

    #[test]
    fn manual_reports_need_valid_datetimes() {
        let mut conn = conn();
        let input = ReportInput {
            failure_at: "あした".into(),
            ..Default::default()
        };
        assert!(create_report(&mut conn, &input, &staff(), "テスト").is_err());
        let input = ReportInput {
            failure_at: "2026-11-09T08:50".into(),
            staff_user_id: Some(2),
            ..Default::default()
        };
        let id = create_report(&mut conn, &input, &staff(), "テスト").unwrap();
        let report = get_report(&conn, id).unwrap();
        assert_eq!(report.staff_name, "山田 太郎");
        assert_eq!(report.source, "manual");
    }

    #[test]
    fn files_are_kept_with_the_report() {
        let mut conn = conn();
        let file = NewFile {
            name: "報告書.pdf".into(),
            bytes: b"%PDF-1.4".to_vec(),
        };
        let result = import_parsed(
            &mut conn,
            &parsed(),
            "pdf",
            "報告書.pdf",
            &[file],
            &staff(),
            "テスト",
        )
        .unwrap();
        let report = get_report(&conn, result.report_id).unwrap();
        assert_eq!(report.files.len(), 1);
        assert_eq!(report.files[0].content_type, "application/pdf");
        let (_, bytes) = get_file(&conn, report.files[0].id).unwrap();
        assert_eq!(bytes, b"%PDF-1.4");
        delete_report(&conn, result.report_id).unwrap();
        assert!(get_file(&conn, report.files[0].id).is_err());
    }
}
