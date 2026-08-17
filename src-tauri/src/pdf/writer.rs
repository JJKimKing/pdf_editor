use lopdf::{Dictionary, Object, ObjectId};

use crate::error::AppError;
use crate::pdf::model::{MetadataPatch, PdfMetadata};
use crate::pdf::reader::{
    is_standard_key, load_document, read_metadata, AUTHOR_ALIASES, CREATOR_ALIASES,
    KEYWORDS_ALIASES, PRODUCER_ALIASES, SUBJECT_ALIASES, TITLE_ALIASES,
};

/// Get the /Info dictionary's object id, creating an empty indirect one and
/// wiring it into the trailer if the document doesn't have one yet.
fn ensure_info_id(doc: &mut lopdf::Document) -> ObjectId {
    if let Ok(Object::Reference(id)) = doc.trailer.get(b"Info") {
        let id = *id;
        if doc.get_dictionary(id).is_ok() {
            return id;
        }
    }
    let id = doc.add_object(Object::Dictionary(Dictionary::new()));
    doc.trailer.set("Info", Object::Reference(id));
    id
}

/// Which key spelling to write a field under: whichever of [primary,
/// ...aliases] is already present in the dict, defaulting to the English
/// primary key for a field that doesn't exist yet. Keeps us from creating a
/// second "/Author" alongside an existing "作者" the file already used.
fn resolve_key<'a>(dict: &Dictionary, primary: &'a str, aliases: &'a [&'a str]) -> &'a str {
    if dict.has(primary.as_bytes()) {
        return primary;
    }
    aliases.iter().find(|a| dict.has(a.as_bytes())).copied().unwrap_or(primary)
}

/// `Some("")` clears the field (removing both the primary key and any alias
/// key present), `Some(v)` sets it (under whichever key already exists, or
/// the English primary if none does), `None` leaves it untouched.
fn apply_field(dict: &mut Dictionary, primary: &str, aliases: &[&str], value: &Option<String>) {
    match value {
        Some(v) if v.trim().is_empty() => {
            dict.remove(primary.as_bytes());
            for alias in aliases {
                dict.remove(alias.as_bytes());
            }
        }
        Some(v) => {
            let key = resolve_key(dict, primary, aliases).to_string();
            dict.set(key, lopdf::text_string(v));
        }
        None => {}
    }
}

/// Write the fields present in `patch` into the /Info dictionary, refresh
/// /ModDate, and save the file.
pub fn write_metadata(path: &str, patch: &MetadataPatch) -> Result<PdfMetadata, AppError> {
    let mut doc = load_document(path)?;
    let info_id = ensure_info_id(&mut doc);

    let dict = doc
        .get_dictionary_mut(info_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?;
    apply_field(dict, "Title", TITLE_ALIASES, &patch.title);
    apply_field(dict, "Author", AUTHOR_ALIASES, &patch.author);
    apply_field(dict, "Subject", SUBJECT_ALIASES, &patch.subject);
    apply_field(dict, "Keywords", KEYWORDS_ALIASES, &patch.keywords);
    apply_field(dict, "Creator", CREATOR_ALIASES, &patch.creator);
    apply_field(dict, "Producer", PRODUCER_ALIASES, &patch.producer);
    dict.set("ModDate", Object::from(chrono::Utc::now()));

    doc.save(path)?;
    read_metadata(path)
}

/// Set (or overwrite) one arbitrary /Info key. Rejects the standard keys —
/// those go through `write_metadata` instead so basic-mode fields stay the
/// single source of truth for them.
pub fn set_custom_field(path: &str, key: &str, value: &str) -> Result<PdfMetadata, AppError> {
    let key = key.trim();
    if key.is_empty() {
        return Err(AppError::Pdf("自定义字段名不能为空".to_string()));
    }
    if is_standard_key(key) {
        return Err(AppError::Pdf(format!(
            "\"{key}\" 是标准字段，请在常用/更多属性里直接编辑"
        )));
    }

    let mut doc = load_document(path)?;
    let info_id = ensure_info_id(&mut doc);
    let dict = doc
        .get_dictionary_mut(info_id)
        .map_err(|e| AppError::Pdf(e.to_string()))?;
    dict.set(key, lopdf::text_string(value));
    dict.set("ModDate", Object::from(chrono::Utc::now()));

    doc.save(path)?;
    read_metadata(path)
}

/// Remove one custom /Info key. Refuses to touch standard keys for the same
/// reason `set_custom_field` refuses to create them.
pub fn remove_custom_field(path: &str, key: &str) -> Result<PdfMetadata, AppError> {
    if is_standard_key(key) {
        return Err(AppError::Pdf(format!(
            "\"{key}\" 是标准字段，不能通过这里删除"
        )));
    }

    let mut doc = load_document(path)?;
    if let Ok(Object::Reference(id)) = doc.trailer.get(b"Info") {
        let id = *id;
        if let Ok(dict) = doc.get_dictionary_mut(id) {
            dict.remove(key.as_bytes());
            dict.set("ModDate", Object::from(chrono::Utc::now()));
        }
    }

    doc.save(path)?;
    read_metadata(path)
}
