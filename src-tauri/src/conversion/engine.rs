use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::conversion::model::{DuplicatePolicy, TaskType};
use crate::error::AppError;

/// Adapter around LibreOffice headless (`soffice --headless --convert-to`).
///
/// This is the engine for *both* PDF→DOCX and DOCX→PDF: it's the only free,
/// license-free converter that behaves the same on macOS and Windows, which
/// is why we don't touch the Windows-only Word COM automation route. The UI
/// and the conversion queue never talk to `soffice` directly — everything
/// goes through this module so the engine can be swapped later without
/// touching call sites.
pub struct LibreOfficeEngine {
    binary: PathBuf,
}

fn candidate_paths() -> Vec<PathBuf> {
    let mut v = vec![PathBuf::from("soffice")];
    if cfg!(target_os = "macos") {
        v.push(PathBuf::from(
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        ));
    } else if cfg!(target_os = "windows") {
        v.push(PathBuf::from(
            r"C:\Program Files\LibreOffice\program\soffice.exe",
        ));
        v.push(PathBuf::from(
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ));
    } else {
        v.push(PathBuf::from("/usr/bin/soffice"));
        v.push(PathBuf::from("/usr/bin/libreoffice"));
        v.push(PathBuf::from("/snap/bin/libreoffice"));
    }
    v
}

impl LibreOfficeEngine {
    /// Look for a usable `soffice` binary: first a caller-supplied override
    /// (the path our own one-click installer wrote to `Settings.libreoffice_path`,
    /// if any), then PATH, then the well-known per-platform install
    /// locations. Returns `EngineNotFound` (a real, user-facing error —
    /// never a silent no-op) if none work.
    pub fn detect(override_path: Option<&str>) -> Result<Self, AppError> {
        if let Some(p) = override_path {
            let candidate = PathBuf::from(p);
            if candidate.exists() {
                return Ok(Self { binary: candidate });
            }
        }
        for candidate in candidate_paths() {
            if candidate.is_absolute() {
                if candidate.exists() {
                    return Ok(Self { binary: candidate });
                }
                continue;
            }
            // Bare name: only resolvable through PATH — probe it directly
            // rather than reimplementing PATH search.
            let ok = std::process::Command::new(&candidate)
                .arg("--version")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if ok {
                return Ok(Self { binary: candidate });
            }
        }
        Err(AppError::EngineNotFound)
    }

    /// Spawn the conversion. Returns the running child (caller registers its
    /// pid for cancellation) together with a receiver that resolves once the
    /// process exits. `work_dir` is a private, per-task scratch directory:
    /// LibreOffice writes `<stem>.<target_ext>` there, and the caller moves
    /// the result to its real destination afterward so filename collisions
    /// and the duplicate-file policy are handled by us, not by soffice.
    pub fn spawn(
        &self,
        input: &Path,
        work_dir: &Path,
        task_type: TaskType,
        profile_dir: &Path,
    ) -> std::io::Result<tokio::process::Child> {
        let profile_url = format!("file://{}", profile_dir.to_string_lossy());
        let mut cmd = tokio::process::Command::new(&self.binary);
        cmd.arg("--headless")
            .arg("--norestore")
            .arg(format!("-env:UserInstallation={profile_url}"));
        // LibreOffice's default type detection opens a .pdf via its Draw
        // engine (PDF's "native" association), which has no docx export
        // filter at all — converting fails with "no export filter for
        // ...docx found" even though the file is perfectly valid. Forcing
        // the Writer PDF-import filter makes it import as editable text
        // instead, which does have a docx export path. Verified against a
        // real install: without this flag the conversion aborts instantly;
        // with it, it produces a normal .docx. DOCX→PDF doesn't need this —
        // Writer opens .docx natively and always has a PDF export filter.
        if task_type == TaskType::PdfToDocx {
            cmd.arg(r#"--infilter=writer_pdf_import"#);
        }
        cmd.arg("--convert-to")
            .arg(task_type.target_ext())
            .arg("--outdir")
            .arg(work_dir)
            .arg(input)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
}

/// Send SIGKILL (unix) / taskkill (windows) to a spawned soffice process.
/// Used for user-initiated cancel — we don't attempt a graceful shutdown
/// because a half-written office document is useless either way.
pub fn kill_pid(pid: u32) {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

/// Compute the final destination for a converted file according to the
/// duplicate-name policy. `Rename` never overwrites: `doc.docx` -> `doc
/// (1).docx` -> `doc (2).docx`, ...
pub fn resolve_output_path(
    dir: &Path,
    stem: &str,
    ext: &str,
    policy: DuplicatePolicy,
) -> PathBuf {
    let direct = dir.join(format!("{stem}.{ext}"));
    if policy == DuplicatePolicy::Overwrite || !direct.exists() {
        return direct;
    }
    let mut n = 1u32;
    loop {
        let candidate = dir.join(format!("{stem} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Turn a LibreOffice failure (non-zero exit / missing output file) into a
/// user-facing message plus the raw stderr for the "查看详细信息" panel.
/// LibreOffice's own stderr is sparse and inconsistent, so we can only
/// recognize a couple of literal substrings reliably — everything else
/// falls back to a generic message rather than guessing.
pub fn classify_failure(stderr: &str, exit_code: Option<i32>) -> (String, String) {
    let detail = if stderr.trim().is_empty() {
        format!("soffice exited with code {:?}", exit_code)
    } else {
        stderr.trim().to_string()
    };
    let user_message = if stderr.contains("source file could not be loaded") {
        "无法解析源文件，文件可能已损坏".to_string()
    } else if stderr.contains("Error: no export filter") {
        "无法找到对应的转换格式".to_string()
    } else {
        "转换程序执行失败，请查看详细信息".to_string()
    };
    (user_message, detail)
}
