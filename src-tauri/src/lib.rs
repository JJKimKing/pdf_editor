mod commands;
mod conversion;
mod error;
mod history;
mod pdf;
mod settings;
mod state;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::Manager;

use conversion::ConversionQueue;
use history::HistoryStore;
use settings::SettingsStore;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let app_data_dir = handle
                .path()
                .app_data_dir()
                .expect("app data dir must resolve");
            std::fs::create_dir_all(&app_data_dir)?;

            let history = Arc::new(HistoryStore::open(&app_data_dir.join("history.sqlite3"))?);
            let settings = Arc::new(SettingsStore::load(&app_data_dir.join("settings.json")));
            let queue = Arc::new(ConversionQueue::new(
                handle.clone(),
                Arc::clone(&history),
                Arc::clone(&settings),
                settings.get().max_concurrency,
            ));

            app.manage(AppState {
                files: Mutex::new(HashMap::new()),
                queue,
                history,
                settings,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::files::add_files,
            commands::files::add_folder,
            commands::files::remove_file,
            commands::files::clear_files,
            commands::files::list_files,
            commands::metadata::get_metadata,
            commands::metadata::update_metadata,
            commands::metadata::set_custom_field,
            commands::metadata::remove_custom_field,
            commands::metadata::clear_metadata,
            commands::metadata::batch_update_metadata,
            commands::metadata::batch_clear_metadata,
            commands::images::grayscale_images,
            commands::images::batch_grayscale_images,
            commands::conversion::start_conversion,
            commands::conversion::list_tasks,
            commands::conversion::cancel_task,
            commands::conversion::check_output_conflicts,
            commands::conversion::check_conversion_engine,
            commands::conversion::install_conversion_engine,
            commands::conversion::inspect_source_files,
            commands::conversion::scan_folder,
            commands::history::list_history,
            commands::history::count_history,
            commands::history::delete_history_entry,
            commands::history::clear_history,
            commands::history::check_path_exists,
            commands::settings::get_settings,
            commands::settings::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
