import { useSyncExternalStore } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";

export type UpdateStage = "idle" | "checking" | "up_to_date" | "available" | "downloading" | "ready" | "failed";

export interface UpdateState {
  stage: UpdateStage;
  latestVersion: string | null;
  releaseNotes: string | null;
  progress: number;
  determinate: boolean;
  error: string | null;
}

const idleState: UpdateState = {
  stage: "idle",
  latestVersion: null,
  releaseNotes: null,
  progress: 0,
  determinate: false,
  error: null,
};

let state: UpdateState = idleState;
let pendingUpdate: Update | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  emit();
}

/**
 * Drives "设置 → 关于" → 检查更新, same external-store/state-machine shape as
 * `engineInstallStore` — the only difference is the progress events come
 * from the `@tauri-apps/plugin-updater` JS API instead of a Rust event
 * stream, since the updater plugin needs no custom backend command.
 */
export const updateStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return state;
  },
  async check() {
    if (state.stage === "checking" || state.stage === "downloading") return;
    setState({ stage: "checking", error: null });
    try {
      const update = await checkForUpdate();
      if (!update) {
        pendingUpdate = null;
        setState({ stage: "up_to_date", latestVersion: null, releaseNotes: null });
        return;
      }
      pendingUpdate = update;
      setState({ stage: "available", latestVersion: update.version, releaseNotes: update.body ?? null });
    } catch (e) {
      setState({ stage: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  },
  async installNow() {
    if (!pendingUpdate || state.stage === "downloading") return;
    setState({ stage: "downloading", progress: 0, determinate: false, error: null });
    let totalLength = 0;
    let downloaded = 0;
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalLength = event.data.contentLength ?? 0;
          setState({ determinate: totalLength > 0, progress: 0 });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            setState({ progress: Math.min(100, Math.round((downloaded / totalLength) * 100)) });
          }
        } else if (event.event === "Finished") {
          setState({ progress: 100 });
        }
      });
      setState({ stage: "ready" });
      await relaunch();
    } catch (e) {
      setState({ stage: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  },
  reset() {
    state = idleState;
    pendingUpdate = null;
    emit();
  },
};

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(updateStore.subscribe, updateStore.getSnapshot);
}
