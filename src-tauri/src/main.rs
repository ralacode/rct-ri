// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(not(debug_assertions))]
    {
        let webview_dir = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join("webview2runtime");

        std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &webview_dir);

        println!("{:?}", webview_dir);
    }

    app_lib::run();
}
