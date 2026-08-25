use lopdf::{Dictionary, Object, ObjectId};

use crate::error::AppError;
use crate::pdf::atomic::save_document;
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

/// `Some("")` clears the field (removing both the primary key and any alias
/// key present), `Some(v)` sets it under the PDF-standard English `primary`
/// key and removes any alias key, `None` leaves it untouched.
///
/// We used to keep writing to whichever alias key (e.g. "作者") a file
/// already used, to avoid creating a duplicate. But readers that follow the
/// PDF spec — WPS included — only ever look at the standard key; a value
/// saved under a localized alias is invisible in their Properties dialog no
/// matter how many times the file is reopened. Migrating to the standard
/// key on first edit fixes that, at the cost of the alias key disappearing
/// (which is what we want: one canonical key going forward).
fn apply_field(dict: &mut Dictionary, primary: &str, aliases: &[&str], value: &Option<String>) {
    match value {
        Some(v) if v.trim().is_empty() => {
            dict.remove(primary.as_bytes());
            for alias in aliases {
                dict.remove(alias.as_bytes());
            }
        }
        Some(v) => {
            dict.set(primary, lopdf::text_string(v));
            for alias in aliases {
                dict.remove(alias.as_bytes());
            }
        }
        None => {}
    }
}

/// A patched field is either left alone (`None`), set to a non-empty value,
/// or explicitly cleared (`Some("")`/whitespace-only, per `apply_field`'s
/// semantics) — this checks a re-read value against whichever of those the
/// caller asked for.
fn field_matches(requested: &Option<String>, actual: &Option<String>) -> bool {
    match requested {
        None => true,
        Some(v) if v.trim().is_empty() => actual.is_none(),
        Some(v) => actual.as_deref() == Some(v.as_str()),
    }
}

/// Re-reads the file and checks every field the caller asked to change
/// actually landed — the write is only reported as successful once this
/// passes. Never trust the in-memory `Document` we just wrote; the disk
/// copy is the only thing that matters (product spec §16/§17).
fn verify_patch_applied(path: &str, patch: &MetadataPatch) -> Result<PdfMetadata, AppError> {
    let reread = read_metadata(path)?;
    let checks: [(&str, &Option<String>, &Option<String>); 6] = [
        ("标题", &patch.title, &reread.title),
        ("作者", &patch.author, &reread.author),
        ("主题", &patch.subject, &reread.subject),
        ("关键词", &patch.keywords, &reread.keywords),
        ("Creator", &patch.creator, &reread.creator),
        ("Producer", &patch.producer, &reread.producer),
    ];
    for (label, requested, actual) in checks {
        if !field_matches(requested, actual) {
            return Err(AppError::Pdf(format!(
                "保存后校验失败：字段 \"{label}\" 未生效（写入后重新读取的值与预期不一致），已中止，请重试"
            )));
        }
    }
    Ok(reread)
}

/// Write the fields present in `patch` into the /Info dictionary, refresh
/// /ModDate, save the file, then re-read it from disk and verify every
/// requested field actually took — a mismatch is reported as a failure,
/// never as a silent partial success.
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

    save_document(&mut doc, path)?;
    verify_patch_applied(path, patch)
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

    save_document(&mut doc, path)?;
    let reread = read_metadata(path)?;
    let persisted = reread.custom.iter().any(|f| f.key == key && f.value == value);
    if !persisted {
        return Err(AppError::Pdf(format!(
            "保存后校验失败：自定义字段 \"{key}\" 未生效，已中止，请重试"
        )));
    }
    Ok(reread)
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

    save_document(&mut doc, path)?;
    let reread = read_metadata(path)?;
    if reread.custom.iter().any(|f| f.key == key) {
        return Err(AppError::Pdf(format!(
            "保存后校验失败：自定义字段 \"{key}\" 仍然存在，删除未生效，已中止，请重试"
        )));
    }
    Ok(reread)
}
