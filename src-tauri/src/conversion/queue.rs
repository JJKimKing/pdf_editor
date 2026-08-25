use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::sync::Semaphore;

use crate::conversion::engine::{classify_failure, kill_pid, resolve_output_path, LibreOfficeEngine};
use crate::conversion::model::{ConversionTask, DuplicatePolicy, TaskStatus, TaskType};
use crate::error::AppError;
use crate::history::{HistoryStore, NewHistoryEntry};
use crate::settings::SettingsStore;

pub const TASK_UPDATED_EVENT: &str = "conversion://task-updated";

struct RunningTask {
    pid: Option<u32>,
    cancel_requested: Arc<AtomicBool>,
}

/// Owns every conversion task's lifecycle: queueing, bounded concurrency,
/// engine invocation, cancellation, and pushing the result into History.
/// The UI never spawns `soffice` itself — it only calls into this queue.
pub struct ConversionQueue {
    app: AppHandle,
    tasks: Mutex<HashMap<String, ConversionTask>>,
    running: Mutex<HashMap<String, RunningTask>>,
    semaphore: Arc<Semaphore>,
    history: Arc<HistoryStore>,
    settings: Arc<SettingsStore>,
}

impl ConversionQueue {
    pub fn new(
        app: AppHandle,
        history: Arc<HistoryStore>,
        settings: Arc<SettingsStore>,
        max_concurrency: usize,
    ) -> Self {
        Self {
            app,
            tasks: Mutex::new(HashMap::new()),
            running: Mutex::new(HashMap::new()),
            semaphore: Arc::new(Semaphore::new(max_concurrency.max(1))),
            history,
            settings,
        }
    }

    pub fn list(&self) -> Vec<ConversionTask> {
        let mut v: Vec<_> = self.tasks.lock().unwrap().values().cloned().collect();
        v.sort_by_key(|t| t.created_at);
        v
    }

    fn emit(&self, task: &ConversionTask) {
        let _ = self.app.emit(TASK_UPDATED_EVENT, task.clone());
    }

    fn set_and_emit(&self, task: ConversionTask) {
        self.tasks.lock().unwrap().insert(task.id.clone(), task.clone());
        self.emit(&task);
    }

    /// Enqueue tasks and start running as many as the concurrency limit
    /// allows; the rest sit as `Queued` until a slot frees up.
    pub fn enqueue(
        self: &Arc<Self>,
        task_type: TaskType,
        source_paths: Vec<String>,
        output_dir: String,
        duplicate_policy: DuplicatePolicy,
    ) -> Vec<ConversionTask> {
        let mut created = Vec::with_capacity(source_paths.len());
        for path in source_paths {
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let task = ConversionTask::new(task_type, path, output_dir.clone(), size);
            self.set_and_emit(task.clone());
            created.push(task.clone());

            let this = Arc::clone(self);
            let id = task.id.clone();
            tauri::async_runtime::spawn(async move {
                this.run_one(id, duplicate_policy).await;
            });
        }
        created
    }

    /// Mark a task cancelled. Queued tasks are simply removed from
    /// contention; a processing task's `soffice` child is killed via its
    /// pid so cancel is a real interrupt, not a UI-only flag.
    pub fn cancel(&self, id: &str) -> Result<(), AppError> {
        let mut tasks = self.tasks.lock().unwrap();
        let task = tasks.get_mut(id).ok_or_else(|| AppError::UnknownTask(id.to_string()))?;
        match task.status {
            TaskStatus::Success | TaskStatus::Failed | TaskStatus::Cancelled => return Ok(()),
            TaskStatus::Queued => {
                task.status = TaskStatus::Cancelled;
                task.completed_at = Some(chrono::Utc::now());
                self.emit(task);
            }
            TaskStatus::Processing => {
                if let Some(running) = self.running.lock().unwrap().get(id) {
                    running.cancel_requested.store(true, Ordering::SeqCst);
                    if let Some(pid) = running.pid {
                        kill_pid(pid);
                    }
                }
                // Final status flip to `Cancelled` happens in run_one once the
                // killed process actually exits, so we don't race its own
                // Success/Failed write.
            }
        }
        Ok(())
    }

    async fn run_one(self: Arc<Self>, id: String, duplicate_policy: DuplicatePolicy) {
        let _permit = self.semaphore.acquire().await.expect("semaphore closed");

        // The task may have been cancelled while still queued.
        {
            let tasks = self.tasks.lock().unwrap();
            if let Some(t) = tasks.get(&id) {
                if t.status == TaskStatus::Cancelled {
                    return;
                }
            }
        }

        let source_path;
        let output_dir;
        let task_type;
        {
            let mut tasks = self.tasks.lock().unwrap();
            let task = tasks.get_mut(&id).expect("task disappeared");
            task.status = TaskStatus::Processing;
            task.started_at = Some(chrono::Utc::now());
            source_path = task.source_path.clone();
            output_dir = task.output_dir.clone();
            task_type = task.task_type;
            self.emit(task);
        }
        log::info!(target: "conversion", "task {id} start type={:?} source={source_path}", task_type);

        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.running.lock().unwrap().insert(
            id.clone(),
            RunningTask { pid: None, cancel_requested: Arc::clone(&cancel_flag) },
        );

        let result = self
            .execute(&id, &source_path, &output_dir, task_type, duplicate_policy, &cancel_flag)
            .await;

        self.running.lock().unwrap().remove(&id);

        let mut tasks = self.tasks.lock().unwrap();
        let task = tasks.get_mut(&id).expect("task disappeared");
        task.completed_at = Some(chrono::Utc::now());

        let duration_ms = task
            .started_at
            .map(|s| (chrono::Utc::now() - s).num_milliseconds())
            .unwrap_or(0);

        match result {
            _ if cancel_flag.load(Ordering::SeqCst) => {
                task.status = TaskStatus::Cancelled;
                log::info!(target: "conversion", "task {id} cancelled after {duration_ms}ms");
            }
            Ok(output_path) => {
                task.status = TaskStatus::Success;
                task.output_path = Some(output_path.to_string_lossy().to_string());
                log::info!(target: "conversion", "task {id} succeeded in {duration_ms}ms -> {}", output_path.display());
            }
            Err(e) => {
                task.status = TaskStatus::Failed;
                task.error = Some(e.to_string());
                task.error_detail = e.detail().map(|d| d.to_string());
                log::warn!(target: "conversion", "task {id} failed after {duration_ms}ms: {e}");
            }
        }
        self.emit(task);

        let _ = self.history.insert(NewHistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            source_path: task.source_path.clone(),
            source_name: task.source_name.clone(),
            operation: task.task_type.as_str().to_string(),
            output_path: task.output_path.clone(),
            status: match task.status {
                TaskStatus::Success => "success",
                TaskStatus::Failed => "failed",
                TaskStatus::Cancelled => "cancelled",
                _ => "failed",
            }
            .to_string(),
            error: task.error.clone(),
            file_size: task.file_size,
        });
    }

    async fn execute(
        &self,
        id: &str,
        source_path: &str,
        output_dir: &str,
        task_type: TaskType,
        duplicate_policy: DuplicatePolicy,
        cancel_flag: &Arc<AtomicBool>,
    ) -> Result<PathBuf, AppError> {
        let source = Path::new(source_path);
        if !source.exists() {
            return Err(AppError::FileNotFound(source_path.to_string()));
        }

        if task_type == TaskType::PdfToDocx {
            preflight_pdf(source)?;
        }

        let out_dir = Path::new(output_dir);
        std::fs::create_dir_all(out_dir).map_err(|_| {
            AppError::OutputDirNotWritable(output_dir.to_string())
        })?;
        probe_writable(out_dir)?;

        let engine = LibreOfficeEngine::detect(self.settings.get().libreoffice_path.as_deref())?;

        let app_data = self.app.path_scratch_dir();
        let task_scratch = app_data.join(format!("task-{id}"));
        let work_dir = task_scratch.join("out");
        let profile_dir = task_scratch.join("profile");
        std::fs::create_dir_all(&work_dir)?;
        std::fs::create_dir_all(&profile_dir)?;

        let target_ext = task_type.target_ext();
        let mut child = engine
            .spawn(source, &work_dir, task_type, &profile_dir)
            .map_err(|e| AppError::Conversion {
                user_message: "无法启动转换程序".to_string(),
                detail: e.to_string(),
            })?;

        if let Some(pid) = child.id() {
            if let Some(running) = self.running.lock().unwrap().get_mut(id) {
                running.pid = Some(pid);
            }
        }
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = child.kill().await;
        }

        let mut stderr_buf = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            let _ = stderr.read_to_string(&mut stderr_buf).await;
        }
        let status = child.wait().await.map_err(|e| AppError::Conversion {
            user_message: "转换程序异常退出".to_string(),
            detail: e.to_string(),
        })?;

        let _ = std::fs::remove_dir_all(&profile_dir);

        if cancel_flag.load(Ordering::SeqCst) {
            let _ = std::fs::remove_dir_all(&task_scratch);
            return Err(AppError::Cancelled);
        }

        let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        let produced = work_dir.join(format!("{stem}.{target_ext}"));

        if !status.success() || !produced.exists() {
            let (user_message, detail) = classify_failure(&stderr_buf, status.code());
            let _ = std::fs::remove_dir_all(&task_scratch);
            return Err(AppError::Conversion { user_message, detail });
        }

        let final_path = resolve_output_path(out_dir, stem, target_ext, duplicate_policy);
        std::fs::rename(&produced, &final_path).or_else(|_| {
            std::fs::copy(&produced, &final_path).map(|_| ())
        })?;
        let _ = std::fs::remove_dir_all(&task_scratch);

        Ok(final_path)
    }
}

/// Reject up front rather than letting `soffice` fail opaquely: a corrupt or
/// password-protected PDF produces a much clearer message this way than
/// whatever LibreOffice's stderr happens to say.
fn preflight_pdf(path: &Path) -> Result<(), AppError> {
    let doc = lopdf::Document::load(path)
        .map_err(|e| AppError::InvalidPdf(format!("PDF 文件损坏: {e}")))?;
    if doc.is_encrypted() {
        return Err(AppError::Encrypted(
            path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
        ));
    }
    Ok(())
}

fn probe_writable(dir: &Path) -> Result<(), AppError> {
    let probe = dir.join(format!(".pdftoolkit-write-test-{}", uuid::Uuid::new_v4()));
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            Ok(())
        }
        Err(_) => Err(AppError::OutputDirNotWritable(dir.to_string_lossy().to_string())),
    }
}

/// Small helper trait so `AppHandle` can hand us a private scratch dir
/// without every call site re-deriving it.
trait ScratchDir {
    fn path_scratch_dir(&self) -> PathBuf;
}

impl ScratchDir for AppHandle {
    fn path_scratch_dir(&self) -> PathBuf {
        use tauri::Manager;
        self.path()
            .app_cache_dir()
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("conversion-scratch")
    }
}
