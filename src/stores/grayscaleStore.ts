import { useEffect, useSyncExternalStore } from "react";
import { pdfApi } from "../api/pdf";
import type { GrayscaleOutcome, PdfBasicInfo } from "../types/pdf";
import { handoffStore } from "./handoffStore";
import { toastStore } from "./toastStore";

interface GrayscaleState {
  files: PdfBasicInfo[];
  activeId: string | null;
  selectedIds: Set<string>;
  converting: boolean;
  lastOutcome: { fileId: string; outcome: GrayscaleOutcome } | null;
}

let state: GrayscaleState = {
  files: [],
  activeId: null,
  selectedIds: new Set(),
  converting: false,
  lastOutcome: null,
};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<GrayscaleState>) {
  state = { ...state, ...patch };
  emit();
}

/**
 * Module-level store for the 图片灰度化 page — same shape as `taskStore` /
 * `engineInstallStore`. The file list and "converting" flag used to live in
 * `useState` inside `GrayscalePage`, which meant navigating to another page
 * and back unmounted the component and threw both away, even though the
 * backend conversion kept running and finished successfully in the
 * background. Living at module scope, this survives navigation exactly like
 * the conversion queue's task list does.
 */
export const grayscaleStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return state;
  },
  consumeHandoff() {
    const handed = handoffStore.consume("grayscale");
    if (handed && handed.length > 0) void grayscaleStore.addFiles(handed);
  },
  async addFiles(paths: string[]) {
    const existing = new Set(state.files.map((f) => f.filePath));
    const uniquePaths = paths.filter((p) => {
      if (existing.has(p)) return false;
      existing.add(p);
      return true;
    });
    if (paths.length > uniquePaths.length) {
      toastStore.push("info", `已跳过 ${paths.length - uniquePaths.length} 个重复文件`);
    }
    if (uniquePaths.length === 0) return;
    try {
      const added = await pdfApi.addFiles(uniquePaths);
      setState({
        files: [...state.files, ...added],
        activeId: state.activeId ?? added[0]?.id ?? null,
      });
      toastStore.push("success", `已添加 ${added.length} 个 PDF 文件`);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  },
  async addFolder(dirPath: string, recursive: boolean) {
    try {
      const added = await pdfApi.addFolder(dirPath, recursive);
      const existing = new Set(state.files.map((f) => f.filePath));
      const fresh = added.filter((f) => !existing.has(f.filePath));
      if (fresh.length === 0) return;
      setState({
        files: [...state.files, ...fresh],
        activeId: state.activeId ?? fresh[0].id,
      });
      toastStore.push("success", `已添加 ${fresh.length} 个 PDF 文件`);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  },
  select(id: string, additive: boolean) {
    if (additive) {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setState({ selectedIds: next });
      return;
    }
    setState({ activeId: id, selectedIds: new Set([id]) });
  },
  toggleSelect(id: string) {
    const next = new Set(state.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setState({ selectedIds: next });
  },
  removeFile(id: string) {
    pdfApi.removeFile(id).catch(() => {});
    const nextSelected = new Set(state.selectedIds);
    nextSelected.delete(id);
    setState({
      files: state.files.filter((f) => f.id !== id),
      selectedIds: nextSelected,
      activeId: state.activeId === id ? null : state.activeId,
    });
  },
  /** New grayscale files are separate, independent entries — never replace or rename an existing one. */
  addOutputFile(info: PdfBasicInfo) {
    if (state.files.some((f) => f.id === info.id)) return;
    setState({ files: [...state.files, info] });
  },
  async convertOne() {
    const id = state.activeId;
    if (!id || state.converting) return;
    setState({ converting: true });
    try {
      const outcome = await pdfApi.grayscaleImages(id);
      if (outcome.outputFile) grayscaleStore.addOutputFile(outcome.outputFile);
      setState({ lastOutcome: { fileId: id, outcome } });
    } catch (err) {
      toastStore.push("error", String(err));
    } finally {
      setState({ converting: false });
    }
  },
  async convertBatch(ids: string[]) {
    if (state.converting) return;
    setState({ converting: true });
    try {
      const results = await pdfApi.batchGrayscaleImages(ids);
      const failed = results.filter((r) => !r.success);
      const succeeded = results.filter((r) => r.success);
      let created = 0;
      for (const r of succeeded) {
        if (r.outputFile) {
          grayscaleStore.addOutputFile(r.outputFile);
          created += 1;
        }
      }
      if (failed.length > 0) {
        toastStore.push("error", `${failed.length} 个文件处理失败：${failed[0].error ?? "未知错误"}`);
      } else if (created === 0) {
        toastStore.push("info", "所选文件均无可转换的彩色图片，未生成新文件");
      } else {
        toastStore.push(
          "success",
          `已生成 ${created} 个灰度文件${created < succeeded.length ? `，${succeeded.length - created} 个无需转换` : ""}`,
        );
      }
    } finally {
      setState({ converting: false });
    }
  },
};

export function useGrayscaleState(): GrayscaleState {
  useEffect(() => {
    grayscaleStore.consumeHandoff();
  }, []);
  return useSyncExternalStore(grayscaleStore.subscribe, grayscaleStore.getSnapshot);
}
