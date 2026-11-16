// src-tauri/src/bin/rct_server.rs
// Tauri なしで HTTP サーバーだけを起動する。
// cargo run --no-default-features --bin rct_server

fn main() {
    app_lib::run_server();
}
