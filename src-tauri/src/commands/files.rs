use std::fs;
use std::path::Path;

use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::error::AppError;
use crate::pdf::model::{FileStatus, PdfBasicInfo};
use crate::pdf::reader;
use crate::state::AppState;

/// Read basic info for one path; on failure (corrupt/unsupported PDF) still
/// produce a list entry marked `FileStatus::Error` instead of aborting the
/// whole batch, so one bad file doesn't block importing the rest.
fn read_basic_info_or_error(path: &str) -> PdfBasicInfo {
    reader::read_basic_info(path).unwrap_or_else(|_| {
        let p = Path::new(path);
        let file_name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();
        let file_size = fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        PdfBasicInfo {
            id: Uuid::new_v4().to_string(),
            file_name,
            file_path: path.to_string(),
            file_size,
            page_count: 0,
            pdf_version: "—".to_string(),
            created_at: None,
            modified_at: None,
            encrypted: false,
            status: FileStatus::Error,
        }
    })
}

fn register(state: &AppState, infos: &[PdfBasicInfo]) {
    let mut files = state.files.lock().unwrap();
    for info in infos {
        files.insert(info.id.clone(), info.clone());
    }
}

/// Add one or more PDF files by absolute path (from the native file picker
/// or a drag-and-drop drop event). Returns basic info for each added file.
#[tauri::command]
pub async fn add_files(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<PdfBasicInfo>, AppError> {
    let infos = tauri::async_runtime::spawn_blocking(move || {
        paths.iter().map(|p| read_basic_info_or_error(p)).collect::<Vec<_>>()
    })
    .await
    .map_err(|e| AppError::Pdf(e.to_string()))?;

    register(&state, &infos);
    Ok(infos)
}

/// Scan a directory for `.pdf` files and add them all. Non-recursive unless
/// the caller explicitly asks — the UI always prompts before scanning
/// subfolders rather than silently walking a large tree (product spec §50).
#[tauri::command]
pub async fn add_folder(
    dir_path: String,
    recursive: bool,
    state: State<'_, AppState>,
) -> Result<Vec<PdfBasicInfo>, AppError> {
    let infos = tauri::async_runtime::spawn_blocking(move || {
        scan_dir_for_ext(&dir_path, "pdf", recursive)
            .into_iter()
            .map(|p| read_basic_info_or_error(&p))
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| AppError::Pdf(e.to_string()))?;

    register(&state, &infos);
    Ok(infos)
}

/// Shared non-recursive-by-default folder scan, also used by the
/// conversion pages' "添加文件夹" via `commands::conversion::scan_folder`.
pub(crate) fn scan_dir_for_ext(dir_path: &str, extension: &str, recursive: bool) -> Vec<String> {
    if recursive {
        WalkDir::new(dir_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case(extension))
                    .unwrap_or(false)
            })
            .map(|e| e.path().to_string_lossy().to_string())
            .collect()
    } else {
        std::fs::read_dir(dir_path)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| p.is_file())
                    .filter(|p| {
                        p.extension()
                            .map(|ext| ext.eq_ignore_ascii_case(extension))
                            .unwrap_or(false)
                    })
                    .map(|p| p.to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default()
    }
}

/// Remove a single file from the list (does not touch the file on disk).
#[tauri::command]
pub fn remove_file(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.files.lock().unwrap().remove(&id);
    Ok(())
}

/// Clear the entire file list.
#[tauri::command]
pub fn clear_files(state: State<'_, AppState>) -> Result<(), AppError> {
    state.files.lock().unwrap().clear();
    Ok(())
}

/// List all files currently held in the registry.
#[tauri::command]
pub fn list_files(state: State<'_, AppState>) -> Result<Vec<PdfBasicInfo>, AppError> {
    Ok(state.files.lock().unwrap().values().cloned().collect())
}
