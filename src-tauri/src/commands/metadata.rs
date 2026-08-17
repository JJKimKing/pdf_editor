use tauri::State;

use crate::error::AppError;
use crate::pdf::model::{BatchResult, FileStatus, MetadataPatch, PdfMetadata};
use crate::pdf::{cleaner, reader, writer};
use crate::state::AppState;

fn path_for(state: &AppState, id: &str) -> Result<String, AppError> {
    state
        .files
        .lock()
        .unwrap()
        .get(id)
        .map(|f| f.file_path.clone())
        .ok_or_else(|| AppError::UnknownId(id.to_string()))
}

fn mark_modified(state: &AppState, id: &str, meta: &PdfMetadata) {
    if let Some(f) = state.files.lock().unwrap().get_mut(id) {
        f.status = FileStatus::Modified;
        f.modified_at = meta.mod_date.clone();
    }
}

/// Read the full metadata (basic + advanced /Info fields) for one file.
#[tauri::command]
pub async fn get_metadata(id: String, state: State<'_, AppState>) -> Result<PdfMetadata, AppError> {
    let path = path_for(&state, &id)?;
    tauri::async_runtime::spawn_blocking(move || reader::read_metadata(&path))
        .await
        .map_err(|e| AppError::Pdf(e.to_string()))?
}

/// Apply a partial update to one file's metadata and persist it.
#[tauri::command]
pub async fn update_metadata(
    id: String,
    patch: MetadataPatch,
    state: State<'_, AppState>,
) -> Result<PdfMetadata, AppError> {
    let path = path_for(&state, &id)?;
    let meta = tauri::async_runtime::spawn_blocking(move || writer::write_metadata(&path, &patch))
        .await
        .map_err(|e| AppError::Pdf(e.to_string()))??;

    mark_modified(&state, &id, &meta);
    Ok(meta)
}

/// Set (or overwrite) one arbitrary /Info key.
#[tauri::command]
pub async fn set_custom_field(
    id: String,
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<PdfMetadata, AppError> {
    let path = path_for(&state, &id)?;
    let meta = tauri::async_runtime::spawn_blocking(move || writer::set_custom_field(&path, &key, &value))
        .await
        .map_err(|e| AppError::Pdf(e.to_string()))??;

    mark_modified(&state, &id, &meta);
    Ok(meta)
}

/// Remove one custom /Info key.
#[tauri::command]
pub async fn remove_custom_field(
    id: String,
    key: String,
    state: State<'_, AppState>,
) -> Result<PdfMetadata, AppError> {
    let path = path_for(&state, &id)?;
    let meta = tauri::async_runtime::spawn_blocking(move || writer::remove_custom_field(&path, &key))
        .await
        .map_err(|e| AppError::Pdf(e.to_string()))??;

    mark_modified(&state, &id, &meta);
    Ok(meta)
}

/// Strip Title/Author/Subject/Keywords/Creator/Producer from one file.
#[tauri::command]
pub async fn clear_metadata(id: String, state: State<'_, AppState>) -> Result<PdfMetadata, AppError> {
    let path = path_for(&state, &id)?;
    let meta = tauri::async_runtime::spawn_blocking(move || cleaner::clear_metadata(&path))
        .await
        .map_err(|e| AppError::Pdf(e.to_string()))??;

    mark_modified(&state, &id, &meta);
    Ok(meta)
}

/// Apply the same patch to multiple files. Failures on individual files are
/// reported per-id in the result list rather than aborting the whole batch.
#[tauri::command]
pub async fn batch_update_metadata(
    ids: Vec<String>,
    patch: MetadataPatch,
    state: State<'_, AppState>,
) -> Result<Vec<BatchResult>, AppError> {
    let mut results = Vec::with_capacity(ids.len());
    for id in ids {
        let path = match path_for(&state, &id) {
            Ok(p) => p,
            Err(e) => {
                results.push(BatchResult { id, success: false, error: Some(e.to_string()) });
                continue;
            }
        };
        let patch = patch.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || writer::write_metadata(&path, &patch))
            .await
            .map_err(|e| AppError::Pdf(e.to_string()))
            .and_then(|r| r);

        match outcome {
            Ok(meta) => {
                mark_modified(&state, &id, &meta);
                results.push(BatchResult { id, success: true, error: None });
            }
            Err(e) => results.push(BatchResult { id, success: false, error: Some(e.to_string()) }),
        }
    }
    Ok(results)
}

/// Clear metadata on multiple files. Same per-file failure semantics as
/// `batch_update_metadata`.
#[tauri::command]
pub async fn batch_clear_metadata(
    ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<BatchResult>, AppError> {
    let mut results = Vec::with_capacity(ids.len());
    for id in ids {
        let path = match path_for(&state, &id) {
            Ok(p) => p,
            Err(e) => {
                results.push(BatchResult { id, success: false, error: Some(e.to_string()) });
                continue;
            }
        };
        let outcome = tauri::async_runtime::spawn_blocking(move || cleaner::clear_metadata(&path))
            .await
            .map_err(|e| AppError::Pdf(e.to_string()))
            .and_then(|r| r);

        match outcome {
            Ok(meta) => {
                mark_modified(&state, &id, &meta);
                results.push(BatchResult { id, success: true, error: None });
            }
            Err(e) => results.push(BatchResult { id, success: false, error: Some(e.to_string()) }),
        }
    }
    Ok(results)
}
