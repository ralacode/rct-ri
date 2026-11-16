fn main() {
    // `desktop` feature を外したサーバー単体ビルドでは Tauri のビルド処理を行わない。
    #[cfg(feature = "desktop")]
    tauri_build::build()
}
