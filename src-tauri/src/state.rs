use std::collections::HashMap;
use std::sync::Mutex;

use crate::pdf::model::PdfBasicInfo;

/// In-memory registry of files added to the list, keyed by generated id.
/// Keeps the frontend from having to re-send full paths on every call and
/// lets the backend cache basic info between reads.
#[derive(Default)]
pub struct AppState {
    pub files: Mutex<HashMap<String, PdfBasicInfo>>,
}
