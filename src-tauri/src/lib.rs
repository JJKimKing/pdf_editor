mod commands;
mod error;
mod pdf;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
