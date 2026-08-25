use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::conversion::engine::LibreOfficeEngine;
use crate::conversion::{ConversionTask, DuplicatePolicy, TaskType};
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    /// Only known for PDF sources (cheap to read); `None` for DOCX.
    pub page_count: Option<u32>,
    pub valid: bool,
    pub error: Option<String>,
}

fn inspect_one(path: &str, task_type: TaskType) -> SourceFileInfo {
    let pb = Path::new(path);
    let name = pb.file_name().and_then(|n| n.to_str()).unwrap_or(path).to_string();

    if !pb.exists() {
        return SourceFileInfo {
            path: path.to_string(),
            name,
            size: 0,
            page_count: None,
            valid: false,
            error: Some("文件不存在".to_string()),
        };
    }
    let size = std::fs::metadata(pb).map(|m| m.len()).unwrap_or(0);
    let ext = pb
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    if ext != task_type.source_ext() {
        return SourceFileInfo {
            path: path.to_string(),
            name,
            size,
            page_count: None,
            valid: false,
            error: Some(format!("需要 .{} 文件", task_type.source_ext())),
        };
    }

    if task_type == TaskType::PdfToDocx {
        match crate::pdf::reader::read_basic_info(path) {
            Ok(info) => SourceFileInfo {
                path: path.to_string(),
                name,
                size,
                page_count: Some(info.page_count),
                valid: true,
                error: None,
            },
            Err(e) => SourceFileInfo {
                path: path.to_string(),
                name,
                size,
                page_count: None,
                valid: false,
                error: Some(e.to_string()),
            },
        }
    } else {
        SourceFileInfo { path: path.to_string(), name, size, page_count: None, valid: true, error: None }
    }
}

/// Validate + read cheap metadata for candidate source files before they're
/// queued: existence, extension, and (PDF only) page count / corruption via
/// a real parse — not just an extension check (product spec §48).
#[tauri::command]
pub fn inspect_source_files(paths: Vec<String>, task_type: TaskType) -> Vec<SourceFileInfo> {
    paths.iter().map(|p| inspect_one(p, task_type)).collect()
}

/// "添加文件夹" for the conversion pages — non-recursive unless the caller
/// (after prompting the user) asks for recursive.
#[tauri::command]
pub fn scan_folder(dir_path: String, task_type: TaskType, recursive: bool) -> Vec<String> {
    crate::commands::files::scan_dir_for_ext(&dir_path, task_type.source_ext(), recursive)
}

/// Enqueue one or more source files for conversion and start running as many
/// as the configured concurrency allows. Returns the created tasks
/// immediately with status `queued`/`processing`; progress afterward comes
/// through the `conversion://task-updated` event, not polling.
#[tauri::command]
pub fn start_conversion(
    task_type: TaskType,
    paths: Vec<String>,
    output_dir: String,
    policy: Option<DuplicatePolicy>,
    state: State<'_, AppState>,
) -> Result<Vec<ConversionTask>, AppError> {
    let policy = policy.unwrap_or_else(|| state.settings.get().duplicate_policy);
    Ok(state.queue.enqueue(task_type, paths, output_dir, policy))
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>) -> Result<Vec<ConversionTask>, AppError> {
    Ok(state.queue.list())
}

#[tauri::command]
pub fn cancel_task(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.queue.cancel(&id)
}

/// For each candidate source path, report whether converting it into
/// `output_dir` would collide with an existing file — used by the frontend
/// to show the "文件已存在" pre-batch choice dialog when duplicate policy is
/// set to "ask", instead of silently overwriting.
#[tauri::command]
pub fn check_output_conflicts(
    paths: Vec<String>,
    output_dir: String,
    target_ext: String,
) -> Result<Vec<String>, AppError> {
    let dir = Path::new(&output_dir);
    Ok(paths
        .into_iter()
        .filter(|p| {
            Path::new(p)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|stem| dir.join(format!("{stem}.{target_ext}")).exists())
                .unwrap_or(false)
        })
        .collect())
}

/// Whether the LibreOffice engine used for PDF↔DOCX conversion is currently
/// available on this machine — shown in Settings/About and used to short
/// circuit with a clear message before queueing work that would just fail.
#[tauri::command]
pub fn check_conversion_engine(state: State<'_, AppState>) -> bool {
    LibreOfficeEngine::detect(state.settings.get().libreoffice_path.as_deref()).is_ok()
}

/// Download and silently install LibreOffice so PDF↔DOCX conversion works
/// without the user hunting down and running an installer themselves.
/// Streams progress via the `engine://install-progress` event; the final
/// `Ok`/`Err` here is just whether the whole flow completed, not per-step
/// detail (that's in the events).
#[tauri::command]
pub async fn install_conversion_engine(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    crate::conversion::installer::install_libreoffice(&app, &state.settings).await
}
