use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::conversion::DuplicatePolicy;
use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

/// Every field here is backed by a real, working implementation — per the
/// product spec, a setting with no real effect must not be shown, and this
/// struct is the single source of truth for what the UI is allowed to
/// render a control for. The shape is intentionally flat JSON (not tied to
/// any future account system) so it stays trivial to sync to an account
/// later without a migration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub launch_at_startup: bool,
    pub open_folder_after_conversion: bool,
    pub default_output_dir: Option<String>,
    pub duplicate_policy: DuplicatePolicy,
    pub max_concurrency: usize,
    pub theme: ThemePreference,
    /// Path to a `soffice` binary installed by our own one-click installer
    /// flow (`conversion::installer`) rather than found on PATH / the OS's
    /// well-known install locations. Only ever written by that flow, never
    /// user-editable — `LibreOfficeEngine::detect` checks it first so an
    /// engine installed into our own app data dir (macOS: no admin prompt
    /// needed) is still found.
    #[serde(default)]
    pub libreoffice_path: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            launch_at_startup: false,
            open_folder_after_conversion: true,
            default_output_dir: None,
            duplicate_policy: DuplicatePolicy::Rename,
            max_concurrency: 2,
            theme: ThemePreference::System,
            libreoffice_path: None,
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(path: &Path) -> Self {
        let current = std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self { path: path.to_path_buf(), current: Mutex::new(current) }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().unwrap().clone()
    }

    pub fn update(&self, settings: Settings) -> Result<Settings, AppError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&settings)
            .map_err(|e| AppError::Settings(e.to_string()))?;
        std::fs::write(&self.path, json)?;
        *self.current.lock().unwrap() = settings.clone();
        Ok(settings)
    }
}
