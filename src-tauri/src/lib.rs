// src-tauri/src/lib.rs

mod auth;
mod db;
mod events;
mod exam_order;
mod http;
mod patient;

use tauri::{LogicalSize, Manager, PhysicalPosition};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::init_db().expect("DB初期化失敗");
            http::spawn_and_wait().map_err(|error| {
                Box::new(std::io::Error::other(error)) as Box<dyn std::error::Error>
            })?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))?;
            if !cfg!(debug_assertions) {
                use tauri_plugin_autostart::ManagerExt;
                if let Err(error) = app.autolaunch().enable() {
                    log::warn!("スタートアップ登録に失敗しました: {error}");
                    eprintln!("スタートアップ登録に失敗しました: {error}");
                }
            }

            let window = app.get_webview_window("main").unwrap();
            let ui_url = tauri::Url::parse(&http::local_ui_url())
                .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;
            window.navigate(ui_url)?;
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |_app, shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }

                        match shortcut {
                            s if s == &Shortcut::new(Some(Modifiers::CONTROL), Code::Digit1) => {
                                let _ = window.set_size(LogicalSize::new(320, 568));
                                let _ = window.set_position(PhysicalPosition::new(0, 0));
                            }

                            s if s == &Shortcut::new(Some(Modifiers::CONTROL), Code::Digit2) => {
                                let _ = window.set_size(LogicalSize::new(800, 600));
                                let _ = window.set_position(PhysicalPosition::new(0, 0));
                            }

                            s if s == &Shortcut::new(Some(Modifiers::CONTROL), Code::Digit3) => {
                                let _ = window.set_size(LogicalSize::new(800, 600));
                                let _ = window.center();
                            }

                            s if s == &Shortcut::new(Some(Modifiers::CONTROL), Code::Digit4) => {
                                let _ = window.maximize();
                            }

                            _ => {}
                        }
                    })
                    .build(),
            )?;

            let shortcut = app.global_shortcut();

            shortcut.register(Shortcut::new(Some(Modifiers::CONTROL), Code::Digit1))?;
            shortcut.register(Shortcut::new(Some(Modifiers::CONTROL), Code::Digit2))?;
            shortcut.register(Shortcut::new(Some(Modifiers::CONTROL), Code::Digit3))?;
            shortcut.register(Shortcut::new(Some(Modifiers::CONTROL), Code::Digit4))?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
