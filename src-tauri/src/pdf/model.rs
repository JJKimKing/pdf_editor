use serde::{Deserialize, Serialize};

/// Modification status of a file since it was added to the list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Unmodified,
    Modified,
    Error,
}

/// Basic, always-available info shown in the left-hand file list and the
/// "basic info" section of the detail panel. Cheap to compute (no full parse).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBasicInfo {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub page_count: u32,
    pub pdf_version: String,
    /// PDF /Info CreationDate, ISO 8601 if parseable, raw string otherwise.
    pub created_at: Option<String>,
    /// PDF /Info ModDate, ISO 8601 if parseable, raw string otherwise.
    pub modified_at: Option<String>,
    pub status: FileStatus,
}

/// The subset of the /Info dictionary exposed as "friendly" editable fields
/// (basic mode) plus the raw fields needed for advanced mode.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
    pub creation_date: Option<String>,
    pub mod_date: Option<String>,
    /// Any /Info dictionary entries outside the standard PDF keys above —
    /// the PDF spec allows arbitrary additional keys in /Info, and some
    /// workflows rely on custom ones (e.g. an internal project ID).
    pub custom: Vec<CustomField>,
}

/// One arbitrary, user-defined /Info dictionary entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomField {
    pub key: String,
    pub value: String,
}

/// Partial update for metadata fields.
///
/// `None` = leave the field unchanged; `Some(s)` = set the field to `s`
/// (pass `Some(String::new())` to clear a single field). Mirrors the TS
/// `MetadataPatch` type in `src/types/pdf.ts` — keep both in sync.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPatch {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
}

/// Per-file outcome of a batch operation, so one failure doesn't abort the rest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub id: String,
    pub success: bool,
    pub error: Option<String>,
}
