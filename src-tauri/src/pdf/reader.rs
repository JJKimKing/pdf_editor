use std::fs;
use std::path::Path;

use chrono::{DateTime, Local, Utc};
use lopdf::{Dictionary, Document, Object};
use uuid::Uuid;

use crate::error::AppError;
use crate::pdf::model::{CustomField, FileStatus, PdfBasicInfo, PdfMetadata};

// Some non-English PDF authoring tools write /Info entries under localized
// key names instead of the PDF spec's English-only standard keys — e.g. a
// number of Chinese PDF generators write "作者" instead of "/Author". These
// are the aliases we've actually observed in the wild; read/write/clear all
// treat "the field" as whichever of [primary, ...aliases] is present.
pub(crate) const TITLE_ALIASES: &[&str] = &["标题"];
pub(crate) const AUTHOR_ALIASES: &[&str] = &["作者"];
pub(crate) const SUBJECT_ALIASES: &[&str] = &["主题"];
pub(crate) const KEYWORDS_ALIASES: &[&str] = &["关键字", "关键词"];
pub(crate) const CREATOR_ALIASES: &[&str] = &[];
pub(crate) const PRODUCER_ALIASES: &[&str] = &[];

/// (primary English key, known aliases) for every editable standard field.
pub(crate) const FIELD_ALIASES: &[(&str, &[&str])] = &[
    ("Title", TITLE_ALIASES),
    ("Author", AUTHOR_ALIASES),
    ("Subject", SUBJECT_ALIASES),
    ("Keywords", KEYWORDS_ALIASES),
    ("Creator", CREATOR_ALIASES),
    ("Producer", PRODUCER_ALIASES),
];

fn is_standard_key_bytes(key: &[u8]) -> bool {
    if key.eq_ignore_ascii_case(b"CreationDate") || key.eq_ignore_ascii_case(b"ModDate") {
        return true;
    }
    FIELD_ALIASES.iter().any(|(primary, aliases)| {
        key.eq_ignore_ascii_case(primary.as_bytes()) || aliases.iter().any(|a| a.as_bytes() == key)
    })
}

/// Case-insensitive for the English spelling: blocks "title"/"TITLE" too, so
/// a custom field can't be created that's confusable with a standard one
/// (or its known alias, e.g. "作者").
pub(crate) fn is_standard_key(key: &str) -> bool {
    is_standard_key_bytes(key.as_bytes())
}

/// Read a field that may be stored under its English key or a known alias,
/// preferring the English key when (unusually) both are present.
fn read_aliased_field(dict: &Dictionary, primary: &str, aliases: &[&str]) -> Option<String> {
    read_string_field(dict, primary.as_bytes())
        .or_else(|| aliases.iter().find_map(|a| read_string_field(dict, a.as_bytes())))
}

/// Load a PDF from disk, translating IO/parse failures into `AppError`.
/// Shared by writer/cleaner so every entry point validates the same way.
pub(crate) fn load_document(path: &str) -> Result<Document, AppError> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::FileNotFound(path.to_string()));
    }
    Document::load(p).map_err(|e| AppError::InvalidPdf(format!("{}: {}", p.display(), e)))
}

/// Resolve the trailer's /Info entry to the dictionary it points at.
fn info_dictionary(doc: &Document) -> Option<&Dictionary> {
    match doc.trailer.get(b"Info").ok()? {
        Object::Reference(id) => doc.get_dictionary(*id).ok(),
        Object::Dictionary(d) => Some(d),
        _ => None,
    }
}

fn read_string_field(dict: &Dictionary, key: &[u8]) -> Option<String> {
    let obj = dict.get(key).ok()?;
    lopdf::decode_text_string(obj)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Parse a PDF date string (`D:YYYYMMDDHHmmSSOHH'mm`) into RFC 3339 UTC.
/// Falls back to the raw decoded text for malformed dates rather than
/// dropping the field, since real-world PDFs frequently have quirky dates.
fn read_date_field(dict: &Dictionary, key: &[u8]) -> Option<String> {
    let obj = dict.get(key).ok()?;
    let parsed: Option<DateTime<Local>> = obj.as_datetime().and_then(|dt| dt.try_into().ok());
    if let Some(local) = parsed {
        return Some(local.with_timezone(&Utc).to_rfc3339());
    }
    lopdf::decode_text_string(obj)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn read_basic_info(path: &str) -> Result<PdfBasicInfo, AppError> {
    let p = Path::new(path);
    let fs_meta = fs::metadata(p)?;
    let doc = load_document(path)?;
    let page_count = doc.get_pages().len() as u32;
    let info = info_dictionary(&doc);
    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string();

    Ok(PdfBasicInfo {
        id: Uuid::new_v4().to_string(),
        file_name,
        file_path: path.to_string(),
        file_size: fs_meta.len(),
        page_count,
        pdf_version: doc.version.clone(),
        created_at: info.and_then(|d| read_date_field(d, b"CreationDate")),
        modified_at: info.and_then(|d| read_date_field(d, b"ModDate")),
        status: FileStatus::Unmodified,
    })
}

/// Every /Info key that isn't a standard key or a known alias of one, in
/// their original order.
fn read_custom_fields(dict: &Dictionary) -> Vec<CustomField> {
    dict.iter()
        .filter(|(k, _)| !is_standard_key_bytes(k))
        .filter_map(|(k, v)| {
            let key = String::from_utf8(k.clone()).ok()?;
            let value = lopdf::decode_text_string(v).ok()?.trim().to_string();
            Some(CustomField { key, value })
        })
        .collect()
}

pub fn read_metadata(path: &str) -> Result<PdfMetadata, AppError> {
    let doc = load_document(path)?;
    let info = info_dictionary(&doc);

    Ok(PdfMetadata {
        title: info.and_then(|d| read_aliased_field(d, "Title", TITLE_ALIASES)),
        author: info.and_then(|d| read_aliased_field(d, "Author", AUTHOR_ALIASES)),
        subject: info.and_then(|d| read_aliased_field(d, "Subject", SUBJECT_ALIASES)),
        keywords: info.and_then(|d| read_aliased_field(d, "Keywords", KEYWORDS_ALIASES)),
        creator: info.and_then(|d| read_aliased_field(d, "Creator", CREATOR_ALIASES)),
        producer: info.and_then(|d| read_aliased_field(d, "Producer", PRODUCER_ALIASES)),
        creation_date: info.and_then(|d| read_date_field(d, b"CreationDate")),
        mod_date: info.and_then(|d| read_date_field(d, b"ModDate")),
        custom: info.map(read_custom_fields).unwrap_or_default(),
    })
}
