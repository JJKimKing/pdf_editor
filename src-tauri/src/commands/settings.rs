use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

use crate::error::AppError;
use crate::settings::Settings;
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.get()
}

/// Persist the full settings object and apply the side effects that don't
/// just live in the JSON file — currently only the OS-level autostart entry,
/// which has to be toggled through the autostart plugin, not written by us.
#[tauri::command]
pub fn update_settings(
    settings: Settings,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Settings, AppError> {
    let autolaunch = app.autolaunch();
    let currently_enabled = autolaunch.is_enabled().unwrap_or(false);
    if settings.launch_at_startup && !currently_enabled {
        let _ = autolaunch.enable();
    } else if !settings.launch_at_startup && currently_enabled {
        let _ = autolaunch.disable();
    }
    state.settings.update(settings)
}
