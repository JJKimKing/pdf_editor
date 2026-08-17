use lopdf::Object;

use crate::error::AppError;
use crate::pdf::model::PdfMetadata;
use crate::pdf::reader::{load_document, read_metadata, FIELD_ALIASES};

/// Remove Title/Author/Subject/Keywords/Creator/Producer — and any known
/// alias key a non-English PDF tool may have used instead (e.g. "作者") —
/// from the /Info dictionary while leaving page content and every other
/// object untouched.
pub fn clear_metadata(path: &str) -> Result<PdfMetadata, AppError> {
    let mut doc = load_document(path)?;

    let info_id = match doc.trailer.get(b"Info").ok() {
        Some(Object::Reference(id)) => Some(*id),
        _ => None,
    };

    if let Some(id) = info_id {
        if let Ok(dict) = doc.get_dictionary_mut(id) {
            for (primary, aliases) in FIELD_ALIASES {
                dict.remove(primary.as_bytes());
                for alias in *aliases {
                    dict.remove(alias.as_bytes());
                }
            }
            dict.set("ModDate", Object::from(chrono::Utc::now()));
        }
    }

    doc.save(path)?;
    read_metadata(path)
}
