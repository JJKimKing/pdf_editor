use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// One row of `HistoryEntry`, as returned to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub source_path: String,
    pub source_name: String,
    /// "pdf_to_docx" | "docx_to_pdf" | "metadata_write"
    pub operation: String,
    pub output_path: Option<String>,
    /// "success" | "failed" | "cancelled"
    pub status: String,
    pub error: Option<String>,
    pub file_size: u64,
    pub created_at: String,
}

pub struct NewHistoryEntry {
    pub id: String,
    pub source_path: String,
    pub source_name: String,
    pub operation: String,
    pub output_path: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub file_size: u64,
}

/// SQLite-backed history log. Local-only, no account needed — the schema
/// intentionally has no user/account column yet, but adding one later (for
/// syncing history to an eventual account system) is a plain column add,
/// not a redesign.
pub struct HistoryStore {
    conn: Mutex<Connection>,
}

impl HistoryStore {
    pub fn open(db_path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(db_path)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                source_path TEXT NOT NULL,
                source_name TEXT NOT NULL,
                operation TEXT NOT NULL,
                output_path TEXT,
                status TEXT NOT NULL,
                error TEXT,
                file_size INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC)",
            [],
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn insert(&self, entry: NewHistoryEntry) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO history (id, source_path, source_name, operation, output_path, status, error, file_size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry.id,
                entry.source_path,
                entry.source_name,
                entry.operation,
                entry.output_path,
                entry.status,
                entry.error,
                entry.file_size as i64,
            ],
        )?;
        Ok(())
    }

    pub fn count(&self, operation: Option<&str>) -> Result<u32, AppError> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = if let Some(op) = operation {
            conn.query_row("SELECT COUNT(*) FROM history WHERE operation = ?1", params![op], |r| r.get(0))?
        } else {
            conn.query_row("SELECT COUNT(*) FROM history", [], |r| r.get(0))?
        };
        Ok(n as u32)
    }

    pub fn list(&self, limit: u32, offset: u32, operation: Option<&str>) -> Result<Vec<HistoryEntry>, AppError> {
        let conn = self.conn.lock().unwrap();
        let (sql, has_filter) = if operation.is_some() {
            (
                "SELECT id, source_path, source_name, operation, output_path, status, error, file_size, created_at
                 FROM history WHERE operation = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3",
                true,
            )
        } else {
            (
                "SELECT id, source_path, source_name, operation, output_path, status, error, file_size, created_at
                 FROM history ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
                false,
            )
        };
        let mut stmt = conn.prepare(sql)?;
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<HistoryEntry> {
            Ok(HistoryEntry {
                id: row.get(0)?,
                source_path: row.get(1)?,
                source_name: row.get(2)?,
                operation: row.get(3)?,
                output_path: row.get(4)?,
                status: row.get(5)?,
                error: row.get(6)?,
                file_size: row.get::<_, i64>(7)? as u64,
                created_at: row.get(8)?,
            })
        };
        let rows = if has_filter {
            stmt.query_map(params![operation.unwrap(), limit, offset], map_row)?
        } else {
            stmt.query_map(params![limit, offset], map_row)?
        };
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM history WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn clear(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM history", [])?;
        Ok(())
    }
}
