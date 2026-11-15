//! 治療依頼の RIS CSV を、患者登録と治療依頼にする。
//!
//! 画面で選んだファイルのバイト列を [`preview`] と [`apply`] に渡す。
//! 解釈と保存はファイルの出どころに依存しない。将来は exe と同じ階層の
//! [`crate::db::get_ris_dir`] に置かれた CSV を、同じ関数へ渡す。

use crate::patient::model::normalize_and_validate;
use crate::treatment::model::{self, normalize_text};
use chrono::NaiveDate;
use rusqlite::{params, Connection, TransactionBehavior};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

const HEADERS: [&str; 11] = [
    "患者.患者番号",
    "患者.患者氏名",
    "患者.患者氏名カナ",
    "患者.性別名称1",
    "患者.生年月日",
    "患者.身長",
    "患者.体重",
    "検査依頼.検査予定日",
    "検査依頼.検査予定時間",
    "検査依頼.依頼科名称1",
    "検査依頼.依頼者職員氏名",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRow {
    pub line: i32,
    pub patient_id: String,
    pub last_name_kanji: String,
    pub first_name_kanji: String,
    pub last_name_kana: String,
    pub first_name_kana: String,
    pub gender: String,
    pub birth_date: String,
    pub height: Option<f64>,
    pub weight: Option<f64>,
    pub request_date: String,
    pub source_time: String,
    pub slot_time: String,
    pub requesting_department: String,
    pub requesting_physician: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone)]
struct Ready {
    patient_id: String,
    last_name_kanji: String,
    first_name_kanji: String,
    last_name_kana: String,
    first_name_kana: String,
    gender: String,
    birth_date: String,
    height: Option<f64>,
    weight: Option<f64>,
    request_date: String,
    source_time: String,
    slot_time: String,
    requesting_department: String,
    requesting_physician: String,
}

struct Parsed {
    line: i32,
    ready: Result<Ready, String>,
}

enum Action {
    Create,
    Attach,
    Skip,
    Error(String),
}

#[derive(Default)]
struct Seen {
    patients: HashSet<String>,
    slots: HashMap<(String, String), String>,
}

pub fn preview(bytes: &[u8]) -> Result<Vec<ImportRow>, String> {
    let conn = model::open()?;
    preview_on(&conn, bytes)
}

pub fn apply(bytes: &[u8]) -> Result<Vec<ImportRow>, String> {
    let mut conn = model::open()?;
    let rows = apply_on(&mut conn, bytes)?;
    if rows
        .iter()
        .any(|row| row.status == "create" || row.status == "attach")
    {
        crate::events::notify();
    }
    Ok(rows)
}

pub fn preview_on(conn: &Connection, bytes: &[u8]) -> Result<Vec<ImportRow>, String> {
    let parsed = parse_bytes(bytes)?;
    let mut seen = Seen::default();
    let mut rows = Vec::new();
    for item in parsed {
        rows.push(preview_one(conn, &mut seen, item)?);
    }
    Ok(rows)
}

pub fn apply_on(conn: &mut Connection, bytes: &[u8]) -> Result<Vec<ImportRow>, String> {
    let parsed = parse_bytes(bytes)?;
    let mut seen = Seen::default();
    let mut rows = Vec::new();
    for item in parsed {
        rows.push(apply_one(conn, &mut seen, item)?);
    }
    Ok(rows)
}

fn preview_one(conn: &Connection, seen: &mut Seen, item: Parsed) -> Result<ImportRow, String> {
    let ready = match item.ready {
        Ok(ready) => ready,
        Err(message) => return Ok(blank_error(item.line, message)),
    };
    let action = decide(conn, &ready, seen)?;
    let row = row_from_action(item.line, &ready, &action);
    note(seen, &action, &ready);
    Ok(row)
}

fn apply_one(conn: &mut Connection, seen: &mut Seen, item: Parsed) -> Result<ImportRow, String> {
    let ready = match item.ready {
        Ok(ready) => ready,
        Err(message) => return Ok(blank_error(item.line, message)),
    };
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let action = decide(&tx, &ready, seen)?;
    match action {
        Action::Error(message) => Ok(row_from_action(item.line, &ready, &Action::Error(message))),
        Action::Skip => Ok(row_from_action(item.line, &ready, &Action::Skip)),
        Action::Create | Action::Attach => {
            let existing_id = model::patient_db_id(&tx, &ready.patient_id)?;
            let existed = existing_id.is_some();
            let patient_db_id = match existing_id {
                Some(id) => id,
                None => insert_patient(&tx, &ready)?,
            };
            if let Err(message) = model::insert_request(
                &tx,
                patient_db_id,
                &ready.request_date,
                &ready.slot_time,
                &ready.requesting_department,
                &ready.requesting_physician,
            ) {
                return Ok(row_from_action(item.line, &ready, &Action::Error(message)));
            }
            if let Err(error) = tx.commit() {
                return Ok(row_from_action(
                    item.line,
                    &ready,
                    &Action::Error(error.to_string()),
                ));
            }
            let action = if existed {
                Action::Attach
            } else {
                Action::Create
            };
            note(seen, &action, &ready);
            Ok(row_from_action(item.line, &ready, &action))
        }
    }
}

fn decide(conn: &Connection, ready: &Ready, seen: &Seen) -> Result<Action, String> {
    let key = (ready.request_date.clone(), ready.slot_time.clone());
    let occupant = if let Some(patient_id) = seen.slots.get(&key) {
        Some(patient_id.clone())
    } else {
        model::slot_occupant(conn, &ready.request_date, &ready.slot_time)?
    };
    if occupant.as_deref() == Some(ready.patient_id.as_str()) {
        return Ok(Action::Skip);
    }
    if occupant.is_some() {
        return Ok(Action::Error("この枠にはすでに依頼があります".into()));
    }
    if let Err(message) = model::require_open_slot(conn, &ready.request_date, &ready.slot_time) {
        return Ok(Action::Error(message));
    }
    let known = seen.patients.contains(&ready.patient_id)
        || model::patient_db_id(conn, &ready.patient_id)?.is_some();
    if known {
        Ok(Action::Attach)
    } else {
        Ok(Action::Create)
    }
}

fn note(seen: &mut Seen, action: &Action, ready: &Ready) {
    match action {
        Action::Create => {
            seen.patients.insert(ready.patient_id.clone());
            seen.slots.insert(
                (ready.request_date.clone(), ready.slot_time.clone()),
                ready.patient_id.clone(),
            );
        }
        Action::Attach => {
            seen.slots.insert(
                (ready.request_date.clone(), ready.slot_time.clone()),
                ready.patient_id.clone(),
            );
        }
        Action::Skip | Action::Error(_) => {}
    }
}

fn insert_patient(conn: &Connection, ready: &Ready) -> Result<i32, String> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO patients (
            patient_id, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana,
            birth_date, gender, height, weight, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            ready.patient_id,
            ready.last_name_kanji,
            ready.first_name_kanji,
            ready.last_name_kana,
            ready.first_name_kana,
            ready.birth_date,
            ready.gender,
            ready.height,
            ready.weight,
            now,
            now,
        ],
    )
    .map_err(|error| {
        if let rusqlite::Error::SqliteFailure(err, _) = &error {
            if err.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE {
                return "この患者IDは既に登録されています".into();
            }
        }
        error.to_string()
    })?;
    Ok(conn.last_insert_rowid() as i32)
}

fn parse_bytes(bytes: &[u8]) -> Result<Vec<Parsed>, String> {
    let text = decode_csv(bytes)?;
    let table = parse_csv(&text)?;
    let Some((header, data)) = table.split_first() else {
        return Err("CSV が空です".into());
    };
    if header.len() < HEADERS.len() || header[..HEADERS.len()] != HEADERS {
        return Err("治療依頼の CSV ではありません。列名が RIS の出力と一致しません".into());
    }
    if data.is_empty()
        || data
            .iter()
            .all(|row| row.iter().all(|cell| cell.trim().is_empty()))
    {
        return Err("取り込む行がありません".into());
    }
    let mut line = 2;
    let mut rows = Vec::new();
    for raw in data {
        if raw.iter().all(|cell| cell.trim().is_empty()) {
            line += 1;
            continue;
        }
        rows.push(Parsed {
            line,
            ready: normalize_row(raw),
        });
        line += 1;
    }
    if rows.is_empty() {
        return Err("取り込む行がありません".into());
    }
    Ok(rows)
}

fn parse_csv(text: &str) -> Result<Vec<Vec<String>>, String> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(ch);
            }
            continue;
        }
        match ch {
            '"' => in_quotes = true,
            ',' => row.push(std::mem::take(&mut field)),
            '\n' => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            '\r' => {}
            _ => field.push(ch),
        }
    }
    if in_quotes {
        return Err("CSV の引用符が閉じられていません".into());
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    Ok(rows)
}

fn decode_csv(bytes: &[u8]) -> Result<String, String> {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    if let Ok(text) = std::str::from_utf8(bytes) {
        if headers_match(text) {
            return Ok(text.to_string());
        }
    }
    let (text, _, _) = encoding_rs::SHIFT_JIS.decode(bytes);
    if headers_match(&text) {
        return Ok(text.into_owned());
    }
    Err("治療依頼の CSV ではありません。列名が RIS の出力と一致しません".into())
}

fn headers_match(text: &str) -> bool {
    let Ok(table) = parse_csv(text) else {
        return false;
    };
    let Some(header) = table.first() else {
        return false;
    };
    header.len() >= HEADERS.len() && header[..HEADERS.len()] == HEADERS
}

fn normalize_row(raw: &[String]) -> Result<Ready, String> {
    if raw.len() < HEADERS.len() {
        return Err("列が足りません".into());
    }
    let (last_name_kanji, first_name_kanji) = split_name(&raw[1], "氏名")?;
    let (last_kana, first_kana) = split_name(&raw[2], "カナ")?;
    let last_name_kana = katakana_to_hiragana(&last_kana)?;
    let first_name_kana = katakana_to_hiragana(&first_kana)?;
    let (source_time, slot_time) = map_slot(&raw[8])?;
    Ok(Ready {
        patient_id: normalize_and_validate(&raw[0])?,
        last_name_kanji,
        first_name_kanji,
        last_name_kana,
        first_name_kana,
        gender: normalize_gender(&raw[3])?,
        birth_date: parse_ymd(&raw[4], "生年月日")?,
        height: optional_number(&raw[5], "身長")?,
        weight: optional_number(&raw[6], "体重")?,
        request_date: parse_ymd(&raw[7], "検査予定日")?,
        source_time,
        slot_time,
        requesting_department: normalize_text(&raw[9], "依頼科")?,
        requesting_physician: normalize_text(&raw[10], "依頼医")?,
    })
}

fn split_name(raw: &str, label: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = raw
        .split(|ch: char| ch.is_whitespace())
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() != 2 {
        return Err(format!("{label}を姓と名に分けられません"));
    }
    Ok((parts[0].to_string(), parts[1].to_string()))
}

fn katakana_to_hiragana(text: &str) -> Result<String, String> {
    let mut out = String::new();
    for ch in text.chars() {
        let mapped = match ch {
            'ァ'..='ヶ' => char::from_u32(ch as u32 - 0x60).unwrap_or(ch),
            'ー' | 'ぁ'..='ん' | 'ゔ' => ch,
            _ => return Err("カナはカタカナで記入してください".into()),
        };
        out.push(mapped);
    }
    if out.is_empty() {
        return Err("カナはカタカナで記入してください".into());
    }
    Ok(out)
}

fn normalize_gender(raw: &str) -> Result<String, String> {
    let text = raw.trim();
    if text.starts_with('男') {
        Ok("男".into())
    } else if text.starts_with('女') {
        Ok("女".into())
    } else {
        Err("性別は男または女です".into())
    }
}

fn parse_ymd(raw: &str, label: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let date = NaiveDate::parse_from_str(trimmed, "%Y%m%d")
        .or_else(|_| NaiveDate::parse_from_str(trimmed, "%Y-%m-%d"))
        .or_else(|_| NaiveDate::parse_from_str(trimmed, "%Y/%m/%d"))
        .map_err(|_| format!("{label}が正しくありません"))?;
    Ok(date.format("%Y-%m-%d").to_string())
}

fn map_slot(raw: &str) -> Result<(String, String), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("検査予定時間がありません".into());
    }
    let digits: String = trimmed.chars().filter(|ch| ch.is_ascii_digit()).collect();
    let (hour, minute) = match digits.len() {
        4 | 6 => {
            let hour: u32 = digits[0..2]
                .parse()
                .map_err(|_| "検査予定時間を読み取れません".to_string())?;
            let minute: u32 = digits[2..4]
                .parse()
                .map_err(|_| "検査予定時間を読み取れません".to_string())?;
            (hour, minute)
        }
        _ => return Err("検査予定時間を読み取れません".into()),
    };
    if hour > 23 || minute > 59 {
        return Err("検査予定時間を読み取れません".into());
    }
    let source = format!("{hour:02}:{minute:02}");
    let slot = if source == "13:30" || source == "14:30" {
        source.clone()
    } else {
        "15:30".to_string()
    };
    Ok((source, slot))
}

fn optional_number(raw: &str, label: &str) -> Result<Option<f64>, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Ok(None);
    }
    let value: f64 = text
        .parse()
        .map_err(|_| format!("{label}が正しくありません"))?;
    if !value.is_finite() || value < 0.0 {
        return Err(format!("{label}が正しくありません"));
    }
    Ok(Some(value))
}

fn row_from_action(line: i32, ready: &Ready, action: &Action) -> ImportRow {
    let (status, message) = match action {
        Action::Create => (
            "create",
            if ready.source_time == ready.slot_time {
                format!("患者を登録し、{} の依頼を作ります", ready.slot_time)
            } else {
                format!(
                    "患者を登録し、予定 {} を {} の枠に入れます",
                    ready.source_time, ready.slot_time
                )
            },
        ),
        Action::Attach => (
            "attach",
            if ready.source_time == ready.slot_time {
                format!(
                    "登録済みの患者情報は変えずに、{} の依頼を作ります",
                    ready.slot_time
                )
            } else {
                format!(
                    "登録済みの患者情報は変えずに、予定 {} を {} の枠に入れます",
                    ready.source_time, ready.slot_time
                )
            },
        ),
        Action::Skip => ("skip", "この患者の依頼はすでにこの枠にあります".to_string()),
        Action::Error(message) => ("error", message.clone()),
    };
    ImportRow {
        line,
        patient_id: ready.patient_id.clone(),
        last_name_kanji: ready.last_name_kanji.clone(),
        first_name_kanji: ready.first_name_kanji.clone(),
        last_name_kana: ready.last_name_kana.clone(),
        first_name_kana: ready.first_name_kana.clone(),
        gender: ready.gender.clone(),
        birth_date: ready.birth_date.clone(),
        height: ready.height,
        weight: ready.weight,
        request_date: ready.request_date.clone(),
        source_time: ready.source_time.clone(),
        slot_time: ready.slot_time.clone(),
        requesting_department: ready.requesting_department.clone(),
        requesting_physician: ready.requesting_physician.clone(),
        status: status.into(),
        message,
    }
}

fn blank_error(line: i32, message: String) -> ImportRow {
    ImportRow {
        line,
        patient_id: String::new(),
        last_name_kanji: String::new(),
        first_name_kanji: String::new(),
        last_name_kana: String::new(),
        first_name_kana: String::new(),
        gender: String::new(),
        birth_date: String::new(),
        height: None,
        weight: None,
        request_date: String::new(),
        source_time: String::new(),
        slot_time: String::new(),
        requesting_department: String::new(),
        requesting_physician: String::new(),
        status: "error".into(),
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::get_ris_dir;
    use crate::treatment::model::init_tables;
    use rusqlite::Connection;
    use std::path::PathBuf;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();
        conn.execute_batch(
            "CREATE TABLE patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id TEXT NOT NULL UNIQUE,
                last_name_kanji TEXT NOT NULL DEFAULT '',
                first_name_kanji TEXT NOT NULL DEFAULT '',
                last_name_kana TEXT NOT NULL DEFAULT '',
                first_name_kana TEXT NOT NULL DEFAULT '',
                birth_date TEXT NOT NULL DEFAULT '',
                gender TEXT NOT NULL DEFAULT '',
                height REAL,
                weight REAL,
                created_at TEXT DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            );",
        )
        .unwrap();
        init_tables(&conn).unwrap();
        conn
    }

    fn sample_bytes() -> Vec<u8> {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../ris/rt_order/RAWDATA-20261115-20261215-患者～検査依頼.csv");
        std::fs::read(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
    }

    fn csv(body: &str) -> String {
        let mut text = String::from(
            "\"患者.患者番号\",\"患者.患者氏名\",\"患者.患者氏名カナ\",\"患者.性別名称1\",\"患者.生年月日\",\"患者.身長\",\"患者.体重\",\"検査依頼.検査予定日\",\"検査依頼.検査予定時間\",\"検査依頼.依頼科名称1\",\"検査依頼.依頼者職員氏名\"\n",
        );
        text.push_str(body);
        text
    }

    #[test]
    fn ris_dir_is_beside_the_executable() {
        assert!(get_ris_dir().ends_with("ris"));
    }

    #[test]
    fn maps_only_1330_and_1430_to_themselves() {
        assert_eq!(
            map_slot("133000").unwrap(),
            ("13:30".into(), "13:30".into())
        );
        assert_eq!(
            map_slot("143000").unwrap(),
            ("14:30".into(), "14:30".into())
        );
        assert_eq!(
            map_slot("230000").unwrap(),
            ("23:00".into(), "15:30".into())
        );
        assert_eq!(
            map_slot("153000").unwrap(),
            ("15:30".into(), "15:30".into())
        );
        assert_eq!(
            map_slot("13:30:59").unwrap(),
            ("13:30".into(), "13:30".into())
        );
        assert!(map_slot("").is_err());
        assert!(map_slot("夜").is_err());
    }

    #[test]
    fn stores_kana_as_hiragana() {
        assert_eq!(katakana_to_hiragana("ヤマダ").unwrap(), "やまだ");
        assert_eq!(katakana_to_hiragana("ハナコ").unwrap(), "はなこ");
        assert!(katakana_to_hiragana("山田").is_err());
    }

    #[test]
    fn previews_the_sample_and_sends_2300_to_the_temporary_slot() {
        let conn = test_db();
        let rows = preview_on(&conn, &sample_bytes()).unwrap();
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].status, "create");
        assert_eq!(rows[0].last_name_kana, "やまだ");
        assert_eq!(rows[0].first_name_kana, "はなこ");
        assert_eq!(rows[0].slot_time, "13:30");
        assert_eq!(rows[1].slot_time, "14:30");
        assert_eq!(rows[1].last_name_kana, "さとう");
        assert_eq!(rows[2].source_time, "23:00");
        assert_eq!(rows[2].slot_time, "15:30");
        assert_eq!(rows[2].status, "create");
        assert_eq!(rows[2].height, None);
        assert_eq!(rows[2].last_name_kana, "すずき");
        assert_eq!(rows[2].first_name_kana, "いちろう");
        assert_eq!(rows[3].request_date, "2026-11-25");
        assert_eq!(rows[3].slot_time, "13:30");
        assert_eq!(rows[0].requesting_physician, "竹下　卓志");
    }

    #[test]
    fn apply_stores_hiragana_and_a_second_import_is_skipped() {
        let mut conn = test_db();
        let bytes = sample_bytes();
        let rows = apply_on(&mut conn, &bytes).unwrap();
        assert!(rows.iter().all(|row| row.status == "create"));

        let kana: (String, String) = conn
            .query_row(
                "SELECT last_name_kana, first_name_kana FROM patients WHERE patient_id = '7391028461'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(kana, ("やまだ".into(), "はなこ".into()));

        let height: Option<f64> = conn
            .query_row(
                "SELECT height FROM patients WHERE patient_id = '1049382750'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(height, None);
        let slot: String = conn
            .query_row(
                "SELECT r.slot_time
                 FROM treatment_requests r
                 JOIN patients p ON p.id = r.patient_db_id
                 WHERE p.patient_id = '1049382750'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(slot, "15:30");

        let patients: i64 = conn
            .query_row("SELECT COUNT(*) FROM patients", [], |row| row.get(0))
            .unwrap();
        let requests: i64 = conn
            .query_row("SELECT COUNT(*) FROM treatment_requests", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!((patients, requests), (4, 4));

        let again = apply_on(&mut conn, &bytes).unwrap();
        assert!(again.iter().all(|row| row.status == "skip"));
        let patients: i64 = conn
            .query_row("SELECT COUNT(*) FROM patients", [], |row| row.get(0))
            .unwrap();
        assert_eq!(patients, 4);
    }

    #[test]
    fn keeps_an_existing_patient_and_does_not_overwrite_the_name() {
        let mut conn = test_db();
        conn.execute(
            "INSERT INTO patients (patient_id, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, birth_date, gender)
             VALUES ('7391028461', '別人', '太郎', 'べつじん', 'たろう', '1990-01-01', '男')",
            [],
        )
        .unwrap();
        let rows = apply_on(&mut conn, &sample_bytes()).unwrap();
        assert_eq!(rows[0].status, "attach");
        let name: String = conn
            .query_row(
                "SELECT last_name_kanji FROM patients WHERE patient_id = '7391028461'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "別人");
    }

    #[test]
    fn rolls_back_a_new_patient_when_the_slot_is_taken_or_closed() {
        let mut conn = test_db();
        conn.execute(
            "INSERT INTO patients (patient_id, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, birth_date, gender)
             VALUES ('0000000099', '既存', '患者', 'きそん', 'かんじゃ', '1980-01-01', '女')",
            [],
        )
        .unwrap();
        model::insert_request(&conn, 1, "2026-11-16", "15:30", "呼吸器科", "依頼医").unwrap();

        let rows = apply_on(&mut conn, &sample_bytes()).unwrap();
        assert_eq!(rows[2].status, "error");
        assert_eq!(rows[2].message, "この枠にはすでに依頼があります");
        let suzuki: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM patients WHERE patient_id = '1049382750'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(suzuki, 0);
        assert_eq!(rows[0].status, "create");

        let mut conn = test_db();
        model::close_slot_on(&mut conn, "2026-11-16", "day").unwrap();
        let rows = apply_on(&mut conn, &sample_bytes()).unwrap();
        assert_eq!(rows[0].status, "error");
        assert_eq!(rows[0].message, "この枠は閉じています");
        assert_eq!(rows[3].status, "create");
        let closed_day_patient: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM patients WHERE patient_id = '7391028461'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(closed_day_patient, 0);
        let later_day_patient: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM patients WHERE patient_id = '6602819473'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(later_day_patient, 1);
    }

    #[test]
    fn second_row_that_lands_on_the_same_temporary_slot_fails() {
        let mut conn = test_db();
        let text = csv(
            "\"1000000001\",\"山田　花子\",\"ヤマダ　ハナコ\",\"女\",\"19870731\",\"150\",\"50\",\"20261116\",\"230000\",\"呼吸器科\",\"岸　裕人\"\n\"1000000002\",\"佐藤　美咲\",\"サトウ　ミサキ\",\"女\",\"19710717\",\"150\",\"50\",\"20261116\",\"090000\",\"呼吸器科\",\"岸　裕人\"\n",
        );
        let rows = preview_on(&conn, text.as_bytes()).unwrap();
        assert_eq!(rows[0].slot_time, "15:30");
        assert_eq!(rows[1].status, "error");
        assert_eq!(rows[1].message, "この枠にはすでに依頼があります");

        let rows = apply_on(&mut conn, text.as_bytes()).unwrap();
        assert_eq!(rows[0].status, "create");
        assert_eq!(rows[1].status, "error");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM patients", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn rejects_a_name_without_a_space_and_a_closed_weekday() {
        let conn = test_db();
        let text = csv(
            "\"1000000001\",\"山田花子\",\"ヤマダ　ハナコ\",\"女\",\"19870731\",\"\",\"\",\"20261117\",\"133000\",\"呼吸器科\",\"岸　裕人\"\n",
        );
        let rows = preview_on(&conn, text.as_bytes()).unwrap();
        assert_eq!(rows[0].status, "error");
        assert_eq!(rows[0].message, "氏名を姓と名に分けられません");

        let text = csv(
            "\"1000000001\",\"山田　花子\",\"ヤマダ　ハナコ\",\"女\",\"19870731\",\"\",\"\",\"20261117\",\"133000\",\"呼吸器科\",\"岸　裕人\"\n",
        );
        let rows = preview_on(&conn, text.as_bytes()).unwrap();
        assert_eq!(rows[0].status, "error");
        assert_eq!(rows[0].message, "この曜日は診療日ではありません");
    }

    #[test]
    fn reads_shift_jis() {
        let conn = test_db();
        let text = csv(
            "\"0000000123\",\"山田　花子\",\"ヤマダ　ハナコ\",\"女性\",\"1987-07-31\",\"\",\"40\",\"2026/11/16\",\"13:30\",\"乳腺内分泌外科\",\"竹下　卓志\"\n",
        );
        let (bytes, _, _) = encoding_rs::SHIFT_JIS.encode(&text);
        let rows = preview_on(&conn, &bytes).unwrap();
        assert_eq!(rows[0].patient_id, "0000000123");
        assert_eq!(rows[0].gender, "女");
        assert_eq!(rows[0].birth_date, "1987-07-31");
        assert_eq!(rows[0].request_date, "2026-11-16");
        assert_eq!(rows[0].slot_time, "13:30");
        assert_eq!(rows[0].weight, Some(40.0));
        assert_eq!(rows[0].last_name_kana, "やまだ");
    }
}
