use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    PdfToDocx,
    DocxToPdf,
}

impl TaskType {
    /// Used by file-drop validation to reject the wrong file type up front.
    pub fn source_ext(&self) -> &'static str {
        match self {
            TaskType::PdfToDocx => "pdf",
            TaskType::DocxToPdf => "docx",
        }
    }

    pub fn target_ext(&self) -> &'static str {
        match self {
            TaskType::PdfToDocx => "docx",
            TaskType::DocxToPdf => "pdf",
        }
    }

    /// Matches the `type` values used by the History table (see history::HistoryOperation).
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskType::PdfToDocx => "pdf_to_docx",
            TaskType::DocxToPdf => "docx_to_pdf",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Queued,
    Processing,
    Success,
    Failed,
    Cancelled,
}

/// How to resolve an output filename that already exists on disk.
/// `Ask` is a settings-storage value only — the frontend always resolves it
/// to a concrete `Rename`/`Overwrite` (after prompting, via
/// `check_output_conflicts`) before a conversion actually starts. If it
/// somehow reaches `resolve_output_path` unresolved, it behaves like
/// `Rename` — the fail-safe, never-overwrite option.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DuplicatePolicy {
    Ask,
    #[default]
    Rename,
    Overwrite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionTask {
    pub id: String,
    pub task_type: TaskType,
    pub source_path: String,
    pub source_name: String,
    pub file_size: u64,
    pub output_dir: String,
    pub output_path: Option<String>,
    pub status: TaskStatus,
    /// `None` = indeterminate (the engine doesn't report real progress).
    pub progress: Option<f32>,
    pub error: Option<String>,
    pub error_detail: Option<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl ConversionTask {
    pub fn new(task_type: TaskType, source_path: String, output_dir: String, file_size: u64) -> Self {
        let source_name = std::path::Path::new(&source_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&source_path)
            .to_string();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            task_type,
            source_path,
            source_name,
            file_size,
            output_dir,
            output_path: None,
            status: TaskStatus::Queued,
            progress: None,
            error: None,
            error_detail: None,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
        }
    }
}
