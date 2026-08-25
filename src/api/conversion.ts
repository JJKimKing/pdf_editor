/**
 * Typed wrappers around src-tauri/src/commands/conversion.rs. Components
 * should import from here, not call `invoke` directly — see api/pdf.ts for
 * the same convention.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConversionTask, DuplicatePolicy, InstallProgress, SourceFileInfo, TaskType } from "../types/conversion";

const TASK_UPDATED_EVENT = "conversion://task-updated";
const INSTALL_PROGRESS_EVENT = "engine://install-progress";

export const conversionApi = {
  start: (taskType: TaskType, paths: string[], outputDir: string, policy?: DuplicatePolicy) =>
    invoke<ConversionTask[]>("start_conversion", { taskType, paths, outputDir, policy: policy ?? null }),

  inspectSourceFiles: (paths: string[], taskType: TaskType) =>
    invoke<SourceFileInfo[]>("inspect_source_files", { paths, taskType }),

  scanFolder: (dirPath: string, taskType: TaskType, recursive: boolean) =>
    invoke<string[]>("scan_folder", { dirPath, taskType, recursive }),

  listTasks: () => invoke<ConversionTask[]>("list_tasks"),

  cancel: (id: string) => invoke<void>("cancel_task", { id }),

  checkOutputConflicts: (paths: string[], outputDir: string, targetExt: string) =>
    invoke<string[]>("check_output_conflicts", { paths, outputDir, targetExt }),

  checkEngine: () => invoke<boolean>("check_conversion_engine"),

  installEngine: () => invoke<void>("install_conversion_engine"),

  onTaskUpdated: (handler: (task: ConversionTask) => void): Promise<UnlistenFn> =>
    listen<ConversionTask>(TASK_UPDATED_EVENT, (event) => handler(event.payload)),

  onInstallProgress: (handler: (progress: InstallProgress) => void): Promise<UnlistenFn> =>
    listen<InstallProgress>(INSTALL_PROGRESS_EVENT, (event) => handler(event.payload)),
};
