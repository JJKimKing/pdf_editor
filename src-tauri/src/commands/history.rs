use tauri::State;

use crate::error::AppError;
use crate::history::HistoryEntry;
use crate::state::AppState;

#[tauri::command]
pub fn list_history(
    limit: u32,
    offset: u32,
    operation: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<HistoryEntry>, AppError> {
    state.history.list(limit, offset, operation.as_deref())
}

#[tauri::command]
pub fn count_history(operation: Option<String>, state: State<'_, AppState>) -> Result<u32, AppError> {
    state.history.count(operation.as_deref())
}

#[tauri::command]
pub fn delete_history_entry(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.history.delete(&id)
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<(), AppError> {
    state.history.clear()
}

/// Whether a history entry's source file is still on disk — checked lazily
/// when the user acts on a row, not eagerly for the whole table, since the
/// list can hold many entries and most files won't have moved.
#[tauri::command]
pub fn check_path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}
