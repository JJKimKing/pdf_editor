/**
 * Mirrors src-tauri/src/conversion/model.rs — keep both in sync.
 */

export type TaskType = "pdf_to_docx" | "docx_to_pdf";
export type TaskStatus = "queued" | "processing" | "success" | "failed" | "cancelled";
export type DuplicatePolicy = "ask" | "rename" | "overwrite";

export interface ConversionTask {
  id: string;
  taskType: TaskType;
  sourcePath: string;
  sourceName: string;
  fileSize: number;
  outputDir: string;
  outputPath: string | null;
  status: TaskStatus;
  /** `null` = indeterminate; the engine doesn't report a real percentage. */
  progress: number | null;
  error: string | null;
  errorDetail: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SourceFileInfo {
  path: string;
  name: string;
  size: number;
  pageCount: number | null;
  valid: boolean;
  error: string | null;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "等待处理",
  processing: "正在转换",
  success: "转换完成",
  failed: "转换失败",
  cancelled: "已取消",
};

/** Mirrors src-tauri/src/conversion/installer.rs InstallStage/InstallProgress. */
export type InstallStage =
  | "resolving_version"
  | "downloading"
  | "verifying"
  | "installing"
  | "done"
  | "failed";

export interface InstallProgress {
  stage: InstallStage;
  progress: number;
  message: string;
  /** `false` when the server didn't report a size — show an indeterminate/animated bar, not a stalled percentage. */
  determinate: boolean;
}
