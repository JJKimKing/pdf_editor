import { useEffect, useSyncExternalStore } from "react";
import { conversionApi } from "../api/conversion";
import type { ConversionTask } from "../types/conversion";

const tasks = new Map<string, ConversionTask>();
const listeners = new Set<() => void>();
let snapshot: ConversionTask[] = [];
let initPromise: Promise<void> | null = null;

function emit() {
  snapshot = Array.from(tasks.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  listeners.forEach((l) => l());
}

function upsert(task: ConversionTask) {
  tasks.set(task.id, task);
  emit();
}

/**
 * Single app-wide view of every conversion task, fed by the
 * `conversion://task-updated` event so progress/status are pushed from the
 * Rust queue rather than polled. Shared between the PDF→DOCX / DOCX→PDF
 * pages and the status bar's "正在处理 N 个文件" indicator.
 */
export const taskStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return snapshot;
  },
  init(): Promise<void> {
    if (!initPromise) {
      initPromise = (async () => {
        const existing = await conversionApi.listTasks();
        existing.forEach((t) => tasks.set(t.id, t));
        emit();
        await conversionApi.onTaskUpdated(upsert);
      })();
    }
    return initPromise;
  },
};

export function useTasks(): ConversionTask[] {
  useEffect(() => {
    taskStore.init();
  }, []);
  return useSyncExternalStore(taskStore.subscribe, taskStore.getSnapshot);
}

export function useActiveTaskCount(): number {
  const list = useTasks();
  return list.filter((t) => t.status === "queued" || t.status === "processing").length;
}
