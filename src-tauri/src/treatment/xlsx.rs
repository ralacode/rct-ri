//! RIS の「抽出結果」Excel（xlsx・xlsm・xls）を、CSV と同じ列の並びの表にする。
//!
//! RIS の抽出ツールが出す Excel は、上に抽出パターン名などの帯があり、
//! その下の見出し行（患者ID・患者氏名・…・検査予定日時・依頼科名・依頼者氏名）から
//! 表が始まる。シート名や見出し行の位置は決め打ちせず、見出しがそろう行を探す。
//!
//! 出力の各行は CSV の列の並び（患者番号・氏名・カナ・性別・生年月日（YYYYMMDD）・
//! 身長・体重・検査予定日（YYYYMMDD）・検査予定時間（HHMMSS）・依頼科・依頼医）にそろえ、
//! 以降の解釈は CSV と同じ処理に任せる。

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use chrono::{Duration, NaiveDate, NaiveDateTime, Timelike};
use std::io::Cursor;

/// 見出しの候補。左から CSV の列の並びに対応する（検査予定日時だけは日付と時刻の 2 列になる）。
const COLUMNS: [&[&str]; 10] = [
    &["患者ID", "患者番号"],
    &["患者氏名"],
    &["患者氏名カナ", "カナ氏名"],
    &["性別名称", "性別名称1", "性別"],
    &["生年月日"],
    &["身長"],
    &["体重"],
    &["検査予定日時"],
    &["依頼科名", "依頼科名称", "依頼科名称1", "依頼科"],
    &["依頼者氏名", "依頼者職員氏名", "依頼医"],
];

pub const NOT_RT_ORDER: &str =
    "治療依頼の Excel ではありません。患者ID・患者氏名・検査予定日時などの見出しが見つかりません";

/// Excel（xlsx・xlsm）か古い形式（xls）のバイト列か。
pub fn is_workbook(bytes: &[u8]) -> bool {
    bytes.starts_with(b"PK\x03\x04") || bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0])
}

/// （Excel の行番号, CSV と同じ並びの 11 列）の一覧を返す。
pub fn read_rows(bytes: &[u8]) -> Result<Vec<(i32, Vec<String>)>, String> {
    let mut workbook = open_workbook_auto_from_rs(Cursor::new(bytes.to_vec()))
        .map_err(|error| format!("Excel ファイルを開けません: {error}"))?;
    for name in workbook.sheet_names() {
        let Ok(range) = workbook.worksheet_range(&name) else {
            continue;
        };
        let start_row = range.start().map(|(row, _)| row).unwrap_or(0);
        let rows: Vec<&[Data]> = range.rows().collect();
        for (index, header) in rows.iter().enumerate() {
            let Some(columns) = find_columns(header) else {
                continue;
            };
            let mut out = Vec::new();
            for (offset, row) in rows[index + 1..].iter().enumerate() {
                // Excel の行番号（1 始まり）
                let line = (start_row as usize + index + 1 + offset + 1) as i32;
                out.push((line, convert_row(row, &columns)));
            }
            return Ok(out);
        }
    }
    Err(NOT_RT_ORDER.into())
}

fn header_text(cell: &Data) -> String {
    match cell {
        Data::String(text) => text.chars().filter(|ch| !ch.is_whitespace()).collect(),
        _ => String::new(),
    }
}

fn find_columns(row: &[Data]) -> Option<[usize; 10]> {
    let texts: Vec<String> = row.iter().map(header_text).collect();
    let mut columns = [0usize; 10];
    for (slot, names) in COLUMNS.iter().enumerate() {
        columns[slot] = texts
            .iter()
            .position(|text| names.iter().any(|name| text == name))?;
    }
    Some(columns)
}

fn cell(row: &[Data], index: usize) -> &Data {
    row.get(index).unwrap_or(&Data::Empty)
}

fn convert_row(row: &[Data], columns: &[usize; 10]) -> Vec<String> {
    let scheduled = date_time(cell(row, columns[7]));
    vec![
        // 患者IDは数値でも文字列でも読める（先頭の 0 は後で補う）
        text(cell(row, columns[0])),
        text(cell(row, columns[1])),
        text(cell(row, columns[2])),
        text(cell(row, columns[3])),
        date_time(cell(row, columns[4]))
            .map(|dt| dt.format("%Y%m%d").to_string())
            .unwrap_or_else(|| text(cell(row, columns[4]))),
        text(cell(row, columns[5])),
        text(cell(row, columns[6])),
        scheduled
            .map(|dt| dt.format("%Y%m%d").to_string())
            .unwrap_or_else(|| text(cell(row, columns[7]))),
        scheduled
            .map(|dt| dt.format("%H%M%S").to_string())
            .unwrap_or_default(),
        text(cell(row, columns[8])),
        text(cell(row, columns[9])),
    ]
}

fn number_text(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

fn text(cell: &Data) -> String {
    match cell {
        Data::String(text) => text.trim().to_string(),
        Data::Float(value) => number_text(*value),
        Data::Int(value) => value.to_string(),
        Data::DateTime(value) => number_text(value.as_f64()),
        Data::DateTimeIso(text) | Data::DurationIso(text) => text.trim().to_string(),
        Data::Bool(_) | Data::Error(_) | Data::Empty => String::new(),
    }
}

/// 日付のセル（日付の書式の数値・文字列）を日時にする。読めなければ None。
fn date_time(cell: &Data) -> Option<NaiveDateTime> {
    match cell {
        Data::DateTime(value) => value.as_datetime().and_then(round_to_second),
        Data::DateTimeIso(text) => parse_text(text),
        Data::String(text) => parse_text(text),
        _ => None,
    }
}

/// 秒未満を四捨五入する（14:29:59.999 のような誤差を 14:30:00 にする）。
fn round_to_second(dt: NaiveDateTime) -> Option<NaiveDateTime> {
    (dt + Duration::milliseconds(500)).with_nanosecond(0)
}

fn parse_text(raw: &str) -> Option<NaiveDateTime> {
    let text = raw.trim();
    if text.is_empty() {
        return None;
    }
    const DATE_TIMES: [&str; 8] = [
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y%m%d %H%M%S",
        "%Y%m%d %H%M",
    ];
    for format in DATE_TIMES {
        if let Ok(dt) = NaiveDateTime::parse_from_str(text, format) {
            return Some(dt);
        }
    }
    for format in ["%Y/%m/%d", "%Y-%m-%d", "%Y%m%d"] {
        if let Ok(date) = NaiveDate::parse_from_str(text, format) {
            return date.and_hms_opt(0, 0, 0);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_serial_values_and_rounds_to_the_second() {
        use calamine::{ExcelDateTime, ExcelDateTimeType};
        // 2026/12/2 14:30（わずかに手前の値でも 14:30 に丸める）
        let value = ExcelDateTime::new(
            46358.0 + 14.5 / 24.0 - 0.000_000_1,
            ExcelDateTimeType::DateTime,
            false,
        );
        let dt = date_time(&Data::DateTime(value)).unwrap();
        assert_eq!(
            dt.format("%Y-%m-%d %H:%M:%S").to_string(),
            "2026-12-02 14:30:00"
        );
    }

    #[test]
    fn parses_date_text() {
        assert_eq!(
            parse_text("2026/12/2 14:30")
                .unwrap()
                .format("%Y%m%d %H%M%S")
                .to_string(),
            "20261202 143000"
        );
        assert_eq!(
            parse_text("1964/8/17")
                .unwrap()
                .format("%Y%m%d")
                .to_string(),
            "19640817"
        );
        assert!(parse_text("あした").is_none());
    }

    #[test]
    fn finds_header_columns_in_any_order_with_spaces() {
        let row: Vec<Data> = [
            "",
            "患者ID",
            "患者 氏名",
            "患者氏名カナ",
            "性別名称",
            "生年月日",
            "身長",
            "体重",
            "検査予定日時",
            "依頼科名",
            "依頼者氏名",
        ]
        .iter()
        .map(|text| Data::String(text.to_string()))
        .collect();
        assert_eq!(find_columns(&row).unwrap(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        assert!(find_columns(&row[..5]).is_none());
    }
}
