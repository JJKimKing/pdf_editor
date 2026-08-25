use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::conversion::engine::resolve_output_path;
use crate::conversion::DuplicatePolicy;
use crate::error::AppError;
use crate::history::NewHistoryEntry;
use crate::pdf::grayscale;
use crate::pdf::model::{GrayscaleResult, PdfBasicInfo};
use crate::pdf::reader;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrayscaleOutcome {
    pub result: GrayscaleResult,
    /// The newly created file's list entry, already registered — `None`
    /// when there was nothing to convert (no file was created).
    pub output_file: Option<PdfBasicInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrayscaleBatchOutcome {
    pub id: String,
    pub success: bool,
    pub error: Option<String>,
    pub images_converted: u32,
    pub output_file: Option<PdfBasicInfo>,
}

fn source_info(state: &AppState, id: &str) -> Result<(String, String), AppError> {
    let files = state.files.lock().unwrap();
    let f = files.get(id).ok_or_else(|| AppError::UnknownId(id.to_string()))?;
    Ok((f.file_path.clone(), f.file_name.clone()))
}

/// Never overwrites and never touches the source: always
/// "<stem> (灰度).pdf" next to the source file, auto-renamed on collision
/// (same fail-safe `resolve_output_path` the conversion tools use).
fn derive_output_path(source_path: &str) -> String {
    let src = Path::new(source_path);
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    let dir = src.parent().unwrap_or_else(|| Path::new("."));
    resolve_output_path(dir, &format!("{stem} (灰度)"), "pdf", DuplicatePolicy::Rename)
        .to_string_lossy()
        .to_string()
}

/// Register the new grayscale file in the in-memory file list and log a
/// `grayscale_images` history row pointing from the (untouched) source to
/// it. Unlike metadata edits, the source entry itself is never mutated —
/// there's a new file to show instead.
fn register_output(
    state: &AppState,
    source_path: &str,
    source_name: &str,
    result: &GrayscaleResult,
) -> Option<PdfBasicInfo> {
    let output_path = result.output_path.as_ref()?;
    let info = reader::read_basic_info(output_path).ok()?;
    state.files.lock().unwrap().insert(info.id.clone(), info.clone());
    let _ = state.history.insert(NewHistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        source_path: source_path.to_string(),
        source_name: source_name.to_string(),
        operation: "grayscale_images".to_string(),
        output_path: Some(output_path.clone()),
        status: "success".to_string(),
        error: None,
        file_size: result.new_size,
    });
    Some(info)
}

/// Convert every color image in one PDF to grayscale, saved as a new file
/// next to the source. The source file is only ever opened for reading.
#[tauri::command]
pub async fn grayscale_images(id: String, state: State<'_, AppState>) -> Result<GrayscaleOutcome, AppError> {
    let (source_path, source_name) = source_info(&state, &id)?;
    let output_path = derive_output_path(&source_path);
    let src = source_path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || grayscale::grayscale_images(&src, &output_path))
        .await
        .map_err(|e| AppError::Pdf(e.to_string()))??;

    let output_file = register_output(&state, &source_path, &source_name, &result);
    Ok(GrayscaleOutcome { result, output_file })
}

/// Same operation across multiple files, one output file per source. A
/// failure on one file doesn't stop the rest.
#[tauri::command]
pub async fn batch_grayscale_images(
    ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<GrayscaleBatchOutcome>, AppError> {
    let mut results = Vec::with_capacity(ids.len());
    for id in ids {
        let (source_path, source_name) = match source_info(&state, &id) {
            Ok(v) => v,
            Err(e) => {
                results.push(GrayscaleBatchOutcome {
                    id,
                    success: false,
                    error: Some(e.to_string()),
                    images_converted: 0,
                    output_file: None,
                });
                continue;
            }
        };
        let output_path = derive_output_path(&source_path);
        let src = source_path.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || grayscale::grayscale_images(&src, &output_path))
            .await
            .map_err(|e| AppError::Pdf(e.to_string()))
            .and_then(|r| r);

        match outcome {
            Ok(result) => {
                let images_converted = result.images_converted;
                let output_file = register_output(&state, &source_path, &source_name, &result);
                results.push(GrayscaleBatchOutcome {
                    id,
                    success: true,
                    error: None,
                    images_converted,
                    output_file,
                });
            }
            Err(e) => results.push(GrayscaleBatchOutcome {
                id,
                success: false,
                error: Some(e.to_string()),
                images_converted: 0,
                output_file: None,
            }),
        }
    }
    Ok(results)
}
