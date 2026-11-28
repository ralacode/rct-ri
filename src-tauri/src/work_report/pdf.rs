//! Varian（現 Siemens Healthineers）の作業報告書 PDF を読む。
//!
//! 電子署名つきの PDF は文字が埋め込まれているので、画像認識をしなくても項目を取り出せる。
//! VARIAN 時代の様式と、Siemens Healthineers のロゴになった今の様式は、項目の並びが同じ。
//!
//! PDF から取り出した文字は、2 列に並んだ項目が 1 行にまとまり、
//! `2026/09/04 18:30退出日時2026/09/04 16:00到着日時` のように「値 → 見出し」の順になる。
//! 見出しが行の先頭にあるときは「見出し → 値」の順とみなす。
//!
//! 作業内容の本文は「連絡事項」の行のすぐ後ろから、`作業内容` だけの行の手前までに出てくる。
//! お客様・エンジニアの署名は独自のフォントで書かれていて文字として読めないため、
//! 担当技師は機器情報の「取引先責任者」から判断する。

use super::model::ParsedReport;

/// この見出しが両方あれば、この様式の報告書とみなす。
const REQUIRED_LABELS: [&str; 2] = ["作業指示番号", "障害発生日時"];

const LABELS: [&str; 20] = [
    "移動/作業時間合計",
    "作業時間合計",
    "移動時間合計",
    "装置停止時間",
    "障害発生日時",
    "到着日時",
    "装置復帰",
    "退出日時",
    "連絡事項",
    "件名",
    "取引先責任者",
    "UDI",
    "Filament Hours",
    "Beam Hours",
    "Product Name",
    "納入商品",
    "受注番号",
    "作業担当者",
    "ケース",
    "作業指示番号",
];

/// この様式のメーカー名。装置の登録がまだないときに使う。
pub const MANUFACTURER: &str = "Varian";

/// PDF を読み、作業報告書の項目を取り出す。
pub fn parse_pdf(bytes: &[u8]) -> Result<ParsedReport, String> {
    // 壊れた PDF で読み取りライブラリが panic しても、アプリは止めない。
    let text = std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem(bytes))
        .map_err(|_| "PDF を読めませんでした".to_string())?
        .map_err(|error| format!("PDF を読めませんでした: {error}"))?;
    parse_text(&text)
}

/// PDF から取り出した文字から、作業報告書の項目を取り出す。
pub fn parse_text(text: &str) -> Result<ParsedReport, String> {
    if !REQUIRED_LABELS.iter().all(|label| text.contains(label)) {
        return Err(
            "Varian（Siemens Healthineers）の作業報告書として読めませんでした。画面から手入力してください"
                .into(),
        );
    }
    let lines: Vec<&str> = text.lines().collect();

    // 作業内容の本文（連絡事項の行の次から、「作業内容」だけの行の手前まで）
    let notes_line = lines.iter().position(|line| line.contains("連絡事項"));
    let mut body_range = None;
    let mut work_content = String::new();
    if let Some(start) = notes_line {
        let end = lines[start + 1..]
            .iter()
            .position(|line| line.trim() == "作業内容")
            .map(|offset| start + 1 + offset);
        if let Some(end) = end {
            work_content = tidy_block(&lines[start + 1..end]);
            body_range = Some(start + 1..end);
        }
    }

    let mut values: Vec<(&str, String)> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if body_range
            .as_ref()
            .is_some_and(|range| range.contains(&index))
        {
            continue;
        }
        for (label, value) in split_line(line) {
            let value = value.trim().to_string();
            match values.iter_mut().find(|(known, _)| *known == label) {
                Some((_, existing)) if existing.is_empty() => *existing = value,
                Some(_) => {}
                None => values.push((label, value)),
            }
        }
    }
    let get = |label: &str| {
        values
            .iter()
            .find(|(known, _)| *known == label)
            .map(|(_, value)| value.clone())
            .unwrap_or_default()
    };

    let engineer = collapse_spaces(&get("作業担当者"));
    Ok(ParsedReport {
        manufacturer: MANUFACTURER.into(),
        device_name: get("Product Name"),
        device_serial: get("納入商品"),
        title: get("件名"),
        work_type: work_types(&lines),
        work_order_no: get("作業指示番号"),
        failure_at: get("障害発生日時"),
        arrival_at: get("到着日時"),
        recovery_at: get("装置復帰"),
        departure_at: get("退出日時"),
        work_content,
        notes: get("連絡事項"),
        engineers: if engineer.is_empty() {
            Vec::new()
        } else {
            vec![engineer]
        },
        staff_name: collapse_spaces(&get("取引先責任者")),
    })
}

/// 1 行を見出しで区切り、見出しごとの値を返す。
fn split_line(line: &str) -> Vec<(&'static str, &str)> {
    // 見出しの位置を左から探す（長い見出しを優先する。例: 移動/作業時間合計 と 作業時間合計）
    let mut found: Vec<(usize, usize, &'static str)> = Vec::new();
    let mut pos = 0;
    while pos < line.len() {
        let rest = &line[pos..];
        let hit = LABELS
            .iter()
            .filter(|label| rest.starts_with(**label))
            .max_by_key(|label| label.len());
        match hit {
            Some(label) => {
                found.push((pos, pos + label.len(), label));
                pos += label.len();
            }
            None => {
                pos += rest.chars().next().map(char::len_utf8).unwrap_or(1);
            }
        }
    }
    if found.is_empty() {
        return Vec::new();
    }
    // 行の終わりが見出しなら「値 → 見出し」、そうでなく行の先頭が見出しなら「見出し → 値」。
    let ends_with_label = found
        .last()
        .is_some_and(|item| item.1 == line.trim_end().len());
    let label_first = !ends_with_label && found[0].0 == line.len() - line.trim_start().len();
    found
        .iter()
        .enumerate()
        .map(|(i, &(start, end, label))| {
            let value = if label_first {
                let next = found.get(i + 1).map(|item| item.0).unwrap_or(line.len());
                &line[end..next]
            } else {
                let prev = if i == 0 { 0 } else { found[i - 1].1 };
                &line[prev..start]
            };
            (label, value)
        })
        .collect()
}

/// 作業内訳の行（開始日 終了日 納入商品 作業区分 作業時間）から作業区分を集める。
fn work_types(lines: &[&str]) -> String {
    let mut types: Vec<String> = Vec::new();
    for line in lines {
        let tokens: Vec<&str> = line.split_whitespace().collect();
        if tokens.len() < 7
            || !is_date(tokens[0])
            || !is_time(tokens[1])
            || !is_date(tokens[2])
            || !is_time(tokens[3])
        {
            continue;
        }
        let hours = tokens[tokens.len() - 1];
        if hours.parse::<f64>().is_err() {
            continue;
        }
        let kind = tokens[5..tokens.len() - 1].join(" ");
        if !kind.is_empty() && !types.contains(&kind) {
            types.push(kind);
        }
    }
    types.join("・")
}

fn is_date(token: &str) -> bool {
    let parts: Vec<&str> = token.split(['-', '/']).collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| part.chars().all(|c| c.is_ascii_digit()))
}

fn is_time(token: &str) -> bool {
    let parts: Vec<&str> = token.split(':').collect();
    parts.len() == 2
        && parts
            .iter()
            .all(|part| part.chars().all(|c| c.is_ascii_digit()))
}

/// 本文の行をまとめる。前後の空行と、各行の右端の空白を取る。
fn tidy_block(lines: &[&str]) -> String {
    let mut out: Vec<&str> = lines.iter().map(|line| line.trim_end()).collect();
    if let Some(first) = out.first_mut() {
        *first = first.trim_start();
    }
    while out.first().is_some_and(|line| line.is_empty()) {
        out.remove(0);
    }
    while out.last().is_some_and(|line| line.is_empty()) {
        out.pop();
    }
    out.join("\n")
}

/// 全角スペースを含む空白の並びを、半角スペース 1 つにする。
pub fn collapse_spaces(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    // 実際の報告書から取り出した文字の並びをまねた、架空のデータ。
    const CURRENT: &str = "
熊本県 架空市1-1
 架空病院
    1

すべての校正に関わる確認は、お客様の責任範疇となります。

 装置停止時間11.00移動/作業時間合計
 7.00作業時間合計4.00移動時間合計
 2026/11/11 19:45退出日時2026/11/10 16:30到着日時
 2026/11/11 19:45装置復帰2026/11/09 8:50障害発生日時
 共同作業者：東連絡事項
 第3回定期点検実施いたしました。
・ミラー交換

・ランプ交換

作業内容
 定期点検Q2件名
 Tsuzuki Shoya取引先責任者010089947500UDI
 21,544.90Filament Hours716.70Beam Hours
 CLINAC IXProduct NameH295977納入商品
 受注番号熊川　雄大作業担当者
 05871351ケースWO-004698810作業指示番号

作業情報

作業内容

作業内訳

開始日 終了日 納入商品 作業区分 作業時間

2026-11-10 16:30 2026-11-10 20:15 H295977 PMP 3.75

2026-11-11 16:30 2026-11-11 19:45 H295977 PMP 3.25
";

    #[test]
    fn reads_the_current_format() {
        let report = parse_text(CURRENT).unwrap();
        assert_eq!(report.manufacturer, "Varian");
        assert_eq!(report.device_serial, "H295977");
        assert_eq!(report.device_name, "CLINAC IX");
        assert_eq!(report.title, "定期点検Q2");
        assert_eq!(report.work_type, "PMP");
        assert_eq!(report.work_order_no, "WO-004698810");
        assert_eq!(report.failure_at, "2026/11/09 8:50");
        assert_eq!(report.arrival_at, "2026/11/10 16:30");
        assert_eq!(report.recovery_at, "2026/11/11 19:45");
        assert_eq!(report.departure_at, "2026/11/11 19:45");
        assert_eq!(report.notes, "共同作業者：東");
        assert_eq!(
            report.work_content,
            "第3回定期点検実施いたしました。\n・ミラー交換\n\n・ランプ交換"
        );
        assert_eq!(report.engineers, vec!["熊川 雄大".to_string()]);
        assert_eq!(report.staff_name, "Tsuzuki Shoya");
    }

    #[test]
    fn reads_an_empty_notes_field_and_several_work_types() {
        let text = "
 2023/11/09 20:00退出日時2023/11/08 10:30到着日時
 2023/11/10 15:47装置復帰2023/11/08 8:45障害発生日時

連絡事項
 【症状】
件名やケースという言葉が本文にあっても見出しとは扱わない。

作業内容
 MLC Error件名
 Tsuzuki Shoya取引先責任者
 CLINAC-IXProduct NameH295977納入商品
 受注番号東　尚人作業担当者
 04311038ケースWO-002451427作業指示番号
2023-11-08 10:30 2023-11-08 11:30 H295977 Investigate/Trouble Shoot 1.00
2023-11-09 16:45 2023-11-09 20:00 H295977 Replace 3.25
";
        let report = parse_text(text).unwrap();
        assert_eq!(report.notes, "");
        assert_eq!(
            report.work_content,
            "【症状】\n件名やケースという言葉が本文にあっても見出しとは扱わない。"
        );
        assert_eq!(report.title, "MLC Error");
        assert_eq!(report.work_type, "Investigate/Trouble Shoot・Replace");
        assert_eq!(report.engineers, vec!["東 尚人".to_string()]);
    }

    #[test]
    fn reads_label_first_lines() {
        let text =
            "作業指示番号 WO-1 ケース 123\n障害発生日時 2026/01/02 3:04 装置復帰 2026/01/02 5:06\n";
        let report = parse_text(text).unwrap();
        assert_eq!(report.work_order_no, "WO-1");
        assert_eq!(report.failure_at, "2026/01/02 3:04");
        assert_eq!(report.recovery_at, "2026/01/02 5:06");
    }

    #[test]
    fn rejects_other_documents() {
        assert!(parse_text("請求書\n合計 1,000円").is_err());
    }
}
