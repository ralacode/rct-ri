// src-tauri/src/dev_seed.rs
// クラウド開発用のダミーデータ。`RCT_DEV_SEED=1` で `run_server` から呼ばれる。
// 本番の exe（Tauri）からは呼ばない。

use crate::{auth, db, treatment};
use rusqlite::Connection;

/// 開発用の担当者（ログイン画面でこの ID とパスワードを使う）。
pub const DEV_USER_ID: &str = "00000001";
pub const DEV_PASSWORD: &str = "devpassword";

/// 架空の患者名・患者 ID だけで作ったサンプル CSV（Shift_JIS）。
const SAMPLE_CSV: &[u8] =
    include_bytes!("../../ris/rt_order/RAWDATA-20261115-20261215-患者～検査依頼.csv");

pub fn seed() -> Result<(), String> {
    seed_user()?;
    seed_treatment_orders()?;
    Ok(())
}

fn seed_user() -> Result<(), String> {
    let modality_ids: Vec<i32> = auth::list_modalities()?.iter().map(|m| m.id).collect();
    match auth::setup_first_admin(DEV_USER_ID, DEV_PASSWORD, "開発", "担当", &modality_ids) {
        Ok(_) => {
            eprintln!("開発用担当者を作成しました: ID {DEV_USER_ID} / パスワード {DEV_PASSWORD}");
            Ok(())
        }
        // 2 回目以降の起動では作成済み。
        Err(message) if message.contains("すでに") => Ok(()),
        Err(message) => Err(message),
    }
}

fn seed_treatment_orders() -> Result<(), String> {
    let conn = Connection::open(db::get_db_path()).map_err(|e| e.to_string())?;
    let patients: i64 = conn
        .query_row("SELECT COUNT(*) FROM patients", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if patients > 0 {
        return Ok(());
    }
    let rows = treatment::import::apply(SAMPLE_CSV)?;
    eprintln!("サンプル CSV から {} 件の治療依頼を入れました", rows.len());
    Ok(())
}
