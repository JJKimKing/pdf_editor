use std::path::{Path, PathBuf};

use lopdf::Document;

use crate::error::AppError;

/// Save `doc` to `path` without ever leaving the original file corrupted,
/// even if this process crashes mid-write or the new content turns out to
/// be unreadable:
///
/// 1. write to a hidden temp file *in the same directory* (guarantees same
///    filesystem, so the final swap is a rename rather than a cross-device
///    copy);
/// 2. re-open the temp file with lopdf to confirm it's a valid, readable
///    PDF before touching the original at all;
/// 3. swap it into place. `rename` directly over an existing file is
///    atomic on Unix; Windows can't rename onto an existing file, so there
///    we move the original aside first and roll back if the final rename
///    fails.
///
/// On any failure the original file is left untouched.
pub fn save_document(doc: &mut Document, path: &str) -> Result<(), AppError> {
    let target = Path::new(path);
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let tmp_name = format!(
        ".{}.tmp-{}",
        target.file_name().and_then(|n| n.to_str()).unwrap_or("output.pdf"),
        uuid::Uuid::new_v4()
    );
    let tmp_path: PathBuf = dir.join(tmp_name);

    doc.save(&tmp_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        AppError::Pdf(format!("写入临时文件失败: {e}"))
    })?;

    if let Err(e) = Document::load(&tmp_path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(AppError::Pdf(format!("保存后校验失败，已放弃写入，原文件未改动: {e}")));
    }

    let result = std::fs::rename(&tmp_path, target);
    if result.is_err() {
        // Likely Windows, where rename can't target an existing file.
        // Swap via a backup so we can roll back if the final step fails.
        let backup: PathBuf = dir.join(format!(
            ".{}.bak-{}",
            target.file_name().and_then(|n| n.to_str()).unwrap_or("output.pdf"),
            uuid::Uuid::new_v4()
        ));
        std::fs::rename(target, &backup).map_err(|e| {
            let _ = std::fs::remove_file(&tmp_path);
            AppError::Pdf(format!("无法替换原文件，原文件未改动: {e}"))
        })?;
        match std::fs::rename(&tmp_path, target) {
            Ok(()) => {
                let _ = std::fs::remove_file(&backup);
            }
            Err(e) => {
                // Roll back: restore the original from the backup.
                let _ = std::fs::rename(&backup, target);
                let _ = std::fs::remove_file(&tmp_path);
                return Err(AppError::Pdf(format!("写入失败，已恢复原文件: {e}")));
            }
        }
    }

    Ok(())
}
