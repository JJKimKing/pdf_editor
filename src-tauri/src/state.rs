use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::conversion::ConversionQueue;
use crate::history::HistoryStore;
use crate::pdf::model::PdfBasicInfo;
use crate::settings::SettingsStore;

/// In-memory registry of files added to the metadata-editor list, keyed by
/// generated id. Keeps the frontend from having to re-send full paths on
/// every call and lets the backend cache basic info between reads.
///
/// The conversion queue, history log, and settings are process-wide
/// singletons set up once in `lib.rs::run` and handed to Tauri's `.manage`,
/// so every command reaches them via `State<'_, AppState>`.
pub struct AppState {
    pub files: Mutex<HashMap<String, PdfBasicInfo>>,
    pub queue: Arc<ConversionQueue>,
    pub history: Arc<HistoryStore>,
    pub settings: Arc<SettingsStore>,
}
