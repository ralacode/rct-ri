// 放射線治療の依頼表。検査オーダーとは別のテーブルに置く。

use crate::db::get_db_path;
use chrono::{Datelike, Months, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;

pub const SLOTS: [&str; 3] = ["13:30", "14:30", "15:30"];
pub const DAY_CLOSURE: &str = "day";
const TEXT_LIMIT: usize = 100;
const REMARK_LIMIT: usize = 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreatmentRequest {
    pub id: i32,
    pub patient_db_id: i32,
    pub patient_id: String,
    pub last_name_kanji: String,
    pub first_name_kanji: String,
    pub last_name_kana: String,
    pub first_name_kana: String,
    pub request_date: String,
    pub slot_time: String,
    pub requesting_department: String,
    pub requesting_physician: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotClosure {
    pub id: i32,
    pub closure_date: String,
    pub slot_time: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayRemark {
    pub remark_date: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreatmentBoard {
    pub month: String,
    pub open_weekdays: Vec<i32>,
    pub slots: Vec<String>,
    pub requests: Vec<TreatmentRequest>,
    pub closures: Vec<SlotClosure>,
    pub remarks: Vec<DayRemark>,
}

pub fn init_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS treatment_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_db_id INTEGER NOT NULL,
            request_date TEXT NOT NULL,
            slot_time TEXT NOT NULL,
            requesting_department TEXT NOT NULL,
            requesting_physician TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (patient_db_id) REFERENCES patients (id) ON DELETE CASCADE,
            UNIQUE (request_date, slot_time)
        );
        CREATE TABLE IF NOT EXISTS treatment_slot_closures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            closure_date TEXT NOT NULL,
            slot_time TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (closure_date, slot_time)
        );
        CREATE TABLE IF NOT EXISTS treatment_day_remarks (
            remark_date TEXT PRIMARY KEY,
            body TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS treatment_schedule_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            open_weekdays TEXT NOT NULL
        );
        INSERT OR IGNORE INTO treatment_schedule_settings (id, open_weekdays)
        VALUES (1, '[1,3,4]');",
    )?;
    Ok(())
}

fn open() -> Result<Connection, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON;", [])
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn parse_date(raw: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(raw.trim(), "%Y-%m-%d")
        .map_err(|_| "日付が正しくありません".to_string())
}

fn date_str(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

pub fn normalize_weekdays(days: &[i32]) -> Result<Vec<i32>, String> {
    let mut out = Vec::new();
    for day in days {
        if !(1..=7).contains(day) {
            return Err("曜日の指定が正しくありません".into());
        }
        if !out.contains(day) {
            out.push(*day);
        }
    }
    if out.is_empty() {
        return Err("診療曜日は1つ以上選んでください".into());
    }
    out.sort_unstable();
    Ok(out)
}

fn normalize_text(raw: &str, label: &str) -> Result<String, String> {
    let text = raw.trim().to_string();
    if text.is_empty() {
        return Err(format!("{label}を入力してください"));
    }
    if text.chars().count() > TEXT_LIMIT {
        return Err(format!("{label}は{TEXT_LIMIT}文字以内です"));
    }
    Ok(text)
}

fn normalize_slot(raw: &str) -> Result<String, String> {
    let slot = raw.trim();
    if SLOTS.contains(&slot) {
        Ok(slot.to_string())
    } else {
        Err("時間枠が正しくありません".into())
    }
}

fn normalize_closure_slot(raw: &str) -> Result<String, String> {
    let slot = raw.trim();
    if slot == DAY_CLOSURE {
        Ok(DAY_CLOSURE.to_string())
    } else {
        normalize_slot(slot)
    }
}

fn load_open_weekdays(conn: &Connection) -> Result<Vec<i32>, String> {
    let raw: String = conn
        .query_row(
            "SELECT open_weekdays FROM treatment_schedule_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|_| "診療曜日の設定を読み取れません".to_string())
}

fn weekday_number(date: NaiveDate) -> i32 {
    date.weekday().number_from_monday() as i32
}

fn patient_exists(conn: &Connection, patient_db_id: i32) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM patients WHERE id = ?1",
            params![patient_db_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

fn slot_is_closed(conn: &Connection, date: &str, slot: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM treatment_slot_closures
             WHERE closure_date = ?1 AND (slot_time = ?2 OR slot_time = ?3)",
            params![date, slot, DAY_CLOSURE],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

fn request_count(
    conn: &Connection,
    date: &str,
    slot: Option<&str>,
    except_id: Option<i32>,
) -> Result<i64, String> {
    let except_id = except_id.unwrap_or(0);
    let count = if let Some(slot) = slot {
        conn.query_row(
            "SELECT COUNT(*) FROM treatment_requests
             WHERE request_date = ?1 AND slot_time = ?2 AND id != ?3",
            params![date, slot, except_id],
            |row| row.get(0),
        )
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM treatment_requests
             WHERE request_date = ?1 AND id != ?2",
            params![date, except_id],
            |row| row.get(0),
        )
    }
    .map_err(|e| e.to_string())?;
    Ok(count)
}

fn ensure_destination(
    conn: &Connection,
    date: &str,
    slot: &str,
    except_id: Option<i32>,
    require_open_weekday: bool,
) -> Result<(), String> {
    if require_open_weekday {
        let parsed = parse_date(date)?;
        let open = load_open_weekdays(conn)?;
        if !open.contains(&weekday_number(parsed)) {
            return Err("この曜日は診療日ではありません".into());
        }
    }
    if slot_is_closed(conn, date, slot)? {
        return Err("この枠は閉じています".into());
    }
    if request_count(conn, date, Some(slot), except_id)? > 0 {
        return Err("この枠にはすでに依頼があります".into());
    }
    Ok(())
}

const REQUEST_COLUMNS: &str = "r.id, r.patient_db_id, p.patient_id, p.last_name_kanji, p.first_name_kanji, p.last_name_kana, p.first_name_kana, r.request_date, r.slot_time, r.requesting_department, r.requesting_physician";

fn map_request(row: &rusqlite::Row<'_>) -> rusqlite::Result<TreatmentRequest> {
    Ok(TreatmentRequest {
        id: row.get(0)?,
        patient_db_id: row.get(1)?,
        patient_id: row.get(2)?,
        last_name_kanji: row.get(3)?,
        first_name_kanji: row.get(4)?,
        last_name_kana: row.get(5)?,
        first_name_kana: row.get(6)?,
        request_date: row.get(7)?,
        slot_time: row.get(8)?,
        requesting_department: row.get(9)?,
        requesting_physician: row.get(10)?,
    })
}

fn month_bounds(month: &str) -> Result<(String, String), String> {
    let start = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| "月の指定が正しくありません".to_string())?;
    let end = start
        .checked_add_months(Months::new(1))
        .ok_or_else(|| "月の指定が正しくありません".to_string())?;
    Ok((date_str(start), date_str(end)))
}

pub fn board(month: &str) -> Result<TreatmentBoard, String> {
    let conn = open()?;
    board_on(&conn, month)
}

pub fn board_on(conn: &Connection, month: &str) -> Result<TreatmentBoard, String> {
    let (start, end) = month_bounds(month)?;
    let open_weekdays = load_open_weekdays(conn)?;

    let mut request_stmt = conn
        .prepare(&format!(
            "SELECT {REQUEST_COLUMNS}
             FROM treatment_requests r
             JOIN patients p ON p.id = r.patient_db_id
             WHERE r.request_date >= ?1 AND r.request_date < ?2
             ORDER BY r.request_date ASC, r.slot_time ASC"
        ))
        .map_err(|e| e.to_string())?;
    let requests = request_stmt
        .query_map(params![start, end], map_request)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut closure_stmt = conn
        .prepare(
            "SELECT id, closure_date, slot_time
             FROM treatment_slot_closures
             WHERE closure_date >= ?1 AND closure_date < ?2
             ORDER BY closure_date ASC, slot_time ASC",
        )
        .map_err(|e| e.to_string())?;
    let closures = closure_stmt
        .query_map(params![start, end], |row| {
            Ok(SlotClosure {
                id: row.get(0)?,
                closure_date: row.get(1)?,
                slot_time: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut remark_stmt = conn
        .prepare(
            "SELECT remark_date, body
             FROM treatment_day_remarks
             WHERE remark_date >= ?1 AND remark_date < ?2 AND body != ''
             ORDER BY remark_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let remarks = remark_stmt
        .query_map(params![start, end], |row| {
            Ok(DayRemark {
                remark_date: row.get(0)?,
                body: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(TreatmentBoard {
        month: start[..7].to_string(),
        open_weekdays,
        slots: SLOTS.iter().map(|slot| (*slot).to_string()).collect(),
        requests,
        closures,
        remarks,
    })
}

pub fn list_for_patient(patient_db_id: i32) -> Result<Vec<TreatmentRequest>, String> {
    let conn = open()?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {REQUEST_COLUMNS}
             FROM treatment_requests r
             JOIN patients p ON p.id = r.patient_db_id
             WHERE r.patient_db_id = ?1
             ORDER BY r.request_date DESC, r.slot_time DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![patient_db_id], map_request)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn open_weekdays() -> Result<Vec<i32>, String> {
    let conn = open()?;
    load_open_weekdays(&conn)
}

pub fn set_open_weekdays(days: &[i32]) -> Result<Vec<i32>, String> {
    let mut conn = open()?;
    let saved = set_open_weekdays_on(&mut conn, days)?;
    crate::events::notify();
    Ok(saved)
}

pub fn set_open_weekdays_on(conn: &mut Connection, days: &[i32]) -> Result<Vec<i32>, String> {
    let days = normalize_weekdays(days)?;
    let encoded = serde_json::to_string(&days).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE treatment_schedule_settings SET open_weekdays = ?1 WHERE id = 1",
        params![encoded],
    )
    .map_err(|e| e.to_string())?;
    Ok(days)
}

pub fn create_request(
    patient_db_id: i32,
    request_date: &str,
    slot_time: &str,
    requesting_department: &str,
    requesting_physician: &str,
) -> Result<(), String> {
    let mut conn = open()?;
    create_request_on(
        &mut conn,
        patient_db_id,
        request_date,
        slot_time,
        requesting_department,
        requesting_physician,
    )?;
    crate::events::notify();
    Ok(())
}

pub fn create_request_on(
    conn: &mut Connection,
    patient_db_id: i32,
    request_date: &str,
    slot_time: &str,
    requesting_department: &str,
    requesting_physician: &str,
) -> Result<(), String> {
    let date = date_str(parse_date(request_date)?);
    let slot = normalize_slot(slot_time)?;
    let department = normalize_text(requesting_department, "依頼科")?;
    let physician = normalize_text(requesting_physician, "依頼医")?;
    if !patient_exists(conn, patient_db_id)? {
        return Err("患者が見つかりません".into());
    }

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    ensure_destination(&tx, &date, &slot, None, true)?;
    let now = now_str();
    tx.execute(
        "INSERT INTO treatment_requests (
            patient_db_id, request_date, slot_time, requesting_department, requesting_physician, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![patient_db_id, date, slot, department, physician, now, now],
    )
    .map_err(|error| map_constraint(error, "この枠にはすでに依頼があります"))?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_request(
    id: i32,
    request_date: &str,
    slot_time: &str,
    requesting_department: &str,
    requesting_physician: &str,
) -> Result<(), String> {
    let mut conn = open()?;
    update_request_on(
        &mut conn,
        id,
        request_date,
        slot_time,
        requesting_department,
        requesting_physician,
    )?;
    crate::events::notify();
    Ok(())
}

pub fn update_request_on(
    conn: &mut Connection,
    id: i32,
    request_date: &str,
    slot_time: &str,
    requesting_department: &str,
    requesting_physician: &str,
) -> Result<(), String> {
    let date = date_str(parse_date(request_date)?);
    let slot = normalize_slot(slot_time)?;
    let department = normalize_text(requesting_department, "依頼科")?;
    let physician = normalize_text(requesting_physician, "依頼医")?;

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let current_date: String = tx
        .query_row(
            "SELECT request_date FROM treatment_requests WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "治療依頼が見つかりません".to_string())?;
    ensure_destination(&tx, &date, &slot, Some(id), current_date != date)?;
    let changed = tx
        .execute(
            "UPDATE treatment_requests
             SET request_date = ?1,
                 slot_time = ?2,
                 requesting_department = ?3,
                 requesting_physician = ?4,
                 updated_at = ?5
             WHERE id = ?6",
            params![date, slot, department, physician, now_str(), id],
        )
        .map_err(|error| map_constraint(error, "この枠にはすでに依頼があります"))?;
    if changed == 0 {
        return Err("治療依頼が見つかりません".into());
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_request(id: i32) -> Result<(), String> {
    let mut conn = open()?;
    delete_request_on(&mut conn, id)?;
    crate::events::notify();
    Ok(())
}

pub fn delete_request_on(conn: &mut Connection, id: i32) -> Result<(), String> {
    let deleted = conn
        .execute("DELETE FROM treatment_requests WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("治療依頼が見つかりません".into());
    }
    Ok(())
}

pub fn closures_on_date(date: &str) -> Result<Vec<SlotClosure>, String> {
    let conn = open()?;
    closures_for_date(&conn, date)
}

fn closures_for_date(conn: &Connection, date: &str) -> Result<Vec<SlotClosure>, String> {
    let date = date_str(parse_date(date)?);
    let mut stmt = conn
        .prepare(
            "SELECT id, closure_date, slot_time
             FROM treatment_slot_closures
             WHERE closure_date = ?1
             ORDER BY CASE slot_time WHEN 'day' THEN 0 ELSE 1 END, slot_time ASC",
        )
        .map_err(|e| e.to_string())?;
    let closures = stmt
        .query_map(params![date], |row| {
            Ok(SlotClosure {
                id: row.get(0)?,
                closure_date: row.get(1)?,
                slot_time: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(closures)
}

pub fn close_slot(closure_date: &str, slot_time: &str) -> Result<(), String> {
    let mut conn = open()?;
    close_slot_on(&mut conn, closure_date, slot_time)?;
    crate::events::notify();
    Ok(())
}

pub fn close_slot_on(
    conn: &mut Connection,
    closure_date: &str,
    slot_time: &str,
) -> Result<(), String> {
    let date = date_str(parse_date(closure_date)?);
    let slot = normalize_closure_slot(slot_time)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;

    if slot == DAY_CLOSURE {
        if request_count(&tx, &date, None, None)? > 0 {
            return Err("依頼が入っている日は休診にできません".into());
        }
        let day_closed: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM treatment_slot_closures
                 WHERE closure_date = ?1 AND slot_time = ?2",
                params![date, DAY_CLOSURE],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if day_closed > 0 {
            return Err("この日はすでに休診です".into());
        }
        tx.execute(
            "DELETE FROM treatment_slot_closures WHERE closure_date = ?1",
            params![date],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let day_closed: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM treatment_slot_closures
                 WHERE closure_date = ?1 AND slot_time = ?2",
                params![date, DAY_CLOSURE],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if day_closed > 0 {
            return Err("この日は休診です".into());
        }
        if request_count(&tx, &date, Some(&slot), None)? > 0 {
            return Err("依頼が入っている枠は閉じられません".into());
        }
        let closed: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM treatment_slot_closures
                 WHERE closure_date = ?1 AND slot_time = ?2",
                params![date, slot],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if closed > 0 {
            return Err("この枠はすでに閉じています".into());
        }
    }

    tx.execute(
        "INSERT INTO treatment_slot_closures (closure_date, slot_time, created_at) VALUES (?1, ?2, ?3)",
        params![date, slot, now_str()],
    )
    .map_err(|error| map_constraint(error, "この枠はすでに閉じています"))?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn open_slot(id: i32) -> Result<(), String> {
    let mut conn = open()?;
    open_slot_on(&mut conn, id)?;
    crate::events::notify();
    Ok(())
}

pub fn open_slot_on(conn: &mut Connection, id: i32) -> Result<(), String> {
    let deleted = conn
        .execute(
            "DELETE FROM treatment_slot_closures WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("枠閉じが見つかりません".into());
    }
    Ok(())
}

pub fn save_remark(remark_date: &str, body: &str) -> Result<(), String> {
    let mut conn = open()?;
    save_remark_on(&mut conn, remark_date, body)?;
    crate::events::notify();
    Ok(())
}

pub fn save_remark_on(conn: &mut Connection, remark_date: &str, body: &str) -> Result<(), String> {
    let date = date_str(parse_date(remark_date)?);
    let body = body.trim();
    if body.chars().count() > REMARK_LIMIT {
        return Err(format!("備考は{REMARK_LIMIT}文字以内です"));
    }
    if body.is_empty() {
        conn.execute(
            "DELETE FROM treatment_day_remarks WHERE remark_date = ?1",
            params![date],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO treatment_day_remarks (remark_date, body, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(remark_date) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
        params![date, body, now_str()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn map_constraint(error: rusqlite::Error, unique_message: &str) -> String {
    if error.to_string().contains("UNIQUE") {
        unique_message.to_string()
    } else {
        error.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        conn.execute(
            "INSERT INTO patients (patient_id, last_name_kanji, first_name_kanji) VALUES ('0000000001', '山田', '花子')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO patients (patient_id, last_name_kanji, first_name_kanji) VALUES ('0000000002', '佐藤', '太郎')",
            [],
        )
        .unwrap();
        conn
    }

    fn place(conn: &mut Connection, patient_db_id: i32, date: &str, slot: &str) {
        create_request_on(conn, patient_db_id, date, slot, "乳腺内分泌外科", "依頼医A").unwrap();
    }

    #[test]
    fn default_weekdays_are_monday_wednesday_thursday() {
        let conn = test_db();
        assert_eq!(load_open_weekdays(&conn).unwrap(), vec![1, 3, 4]);
    }

    #[test]
    fn books_one_patient_per_open_slot_and_allows_temporary_slot() {
        let mut conn = test_db();
        place(&mut conn, 1, "2026-11-02", "13:30");
        place(&mut conn, 2, "2026-11-02", "15:30");
        let error = create_request_on(&mut conn, 2, "2026-11-02", "13:30", "整形外科", "依頼医B")
            .unwrap_err();
        assert_eq!(error, "この枠にはすでに依頼があります");
        let error = create_request_on(&mut conn, 1, "2026-11-03", "13:30", "整形外科", "依頼医B")
            .unwrap_err();
        assert_eq!(error, "この曜日は診療日ではありません");
    }

    #[test]
    fn refuses_to_close_an_occupied_slot_or_day() {
        let mut conn = test_db();
        place(&mut conn, 1, "2026-11-02", "13:30");
        let error = close_slot_on(&mut conn, "2026-11-02", "13:30").unwrap_err();
        assert_eq!(error, "依頼が入っている枠は閉じられません");
        let error = close_slot_on(&mut conn, "2026-11-02", DAY_CLOSURE).unwrap_err();
        assert_eq!(error, "依頼が入っている日は休診にできません");

        close_slot_on(&mut conn, "2026-11-04", "14:30").unwrap();
        close_slot_on(&mut conn, "2026-11-04", DAY_CLOSURE).unwrap();
        let board = board_on(&conn, "2026-11").unwrap();
        assert_eq!(board.closures.len(), 1);
        assert_eq!(board.closures[0].slot_time, DAY_CLOSURE);
        let error = create_request_on(&mut conn, 1, "2026-11-04", "13:30", "婦人科", "依頼医C")
            .unwrap_err();
        assert_eq!(error, "この枠は閉じています");
    }

    #[test]
    fn moves_and_deletes_requests() {
        let mut conn = test_db();
        place(&mut conn, 1, "2026-11-02", "13:30");
        place(&mut conn, 2, "2026-11-02", "14:30");
        let error = update_request_on(
            &mut conn,
            1,
            "2026-11-02",
            "14:30",
            "乳腺内分泌外科",
            "依頼医A",
        )
        .unwrap_err();
        assert_eq!(error, "この枠にはすでに依頼があります");

        close_slot_on(&mut conn, "2026-11-05", "13:30").unwrap();
        let error = update_request_on(
            &mut conn,
            1,
            "2026-11-05",
            "13:30",
            "乳腺内分泌外科",
            "依頼医A",
        )
        .unwrap_err();
        assert_eq!(error, "この枠は閉じています");

        update_request_on(&mut conn, 1, "2026-11-05", "14:30", "消化器科", "依頼医D").unwrap();
        delete_request_on(&mut conn, 1).unwrap();
        place(&mut conn, 1, "2026-11-05", "14:30");
    }

    #[test]
    fn keeps_an_existing_request_when_its_weekday_is_no_longer_open() {
        let mut conn = test_db();
        set_open_weekdays_on(&mut conn, &[1, 2, 3, 4]).unwrap();
        place(&mut conn, 1, "2026-11-03", "13:30");
        set_open_weekdays_on(&mut conn, &[1, 3, 4]).unwrap();
        update_request_on(&mut conn, 1, "2026-11-03", "14:30", "整形外科", "依頼医E").unwrap();
        let error = update_request_on(&mut conn, 1, "2026-11-10", "13:30", "整形外科", "依頼医E")
            .unwrap_err();
        assert_eq!(error, "この曜日は診療日ではありません");
        let rows = list_requests(&conn, 1);
        assert_eq!(rows[0].request_date, "2026-11-03");
        assert_eq!(rows[0].slot_time, "14:30");
        assert_eq!(rows[0].requesting_department, "整形外科");
    }

    #[test]
    fn lists_closures_for_one_date() {
        let mut conn = test_db();
        close_slot_on(&mut conn, "2026-11-04", "13:30").unwrap();
        close_slot_on(&mut conn, "2026-11-04", "15:30").unwrap();
        close_slot_on(&mut conn, "2026-11-05", DAY_CLOSURE).unwrap();

        let rows = closures_for_date(&conn, "2026-11-04").unwrap();
        assert_eq!(
            rows.iter().map(|row| row.slot_time.as_str()).collect::<Vec<_>>(),
            vec!["13:30", "15:30"]
        );
        let rows = closures_for_date(&conn, "2026-11-05").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].slot_time, DAY_CLOSURE);
        assert!(closures_for_date(&conn, "2026-11-02").unwrap().is_empty());
    }

    #[test]
    fn saves_and_clears_day_remarks() {
        let mut conn = test_db();
        save_remark_on(&mut conn, "2026-11-02", "  午後から装置点検  ").unwrap();
        let board = board_on(&conn, "2026-11").unwrap();
        assert_eq!(board.remarks.len(), 1);
        assert_eq!(board.remarks[0].body, "午後から装置点検");
        save_remark_on(&mut conn, "2026-11-02", "   ").unwrap();
        let board = board_on(&conn, "2026-11").unwrap();
        assert!(board.remarks.is_empty());
    }

    #[test]
    fn rejects_empty_weekdays() {
        let mut conn = test_db();
        let error = set_open_weekdays_on(&mut conn, &[]).unwrap_err();
        assert_eq!(error, "診療曜日は1つ以上選んでください");
        let error = set_open_weekdays_on(&mut conn, &[0, 8]).unwrap_err();
        assert_eq!(error, "曜日の指定が正しくありません");
    }

    fn list_requests(conn: &Connection, patient_db_id: i32) -> Vec<TreatmentRequest> {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {REQUEST_COLUMNS}
                 FROM treatment_requests r
                 JOIN patients p ON p.id = r.patient_db_id
                 WHERE r.patient_db_id = ?1"
            ))
            .unwrap();
        stmt.query_map(params![patient_db_id], map_request)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }
}
