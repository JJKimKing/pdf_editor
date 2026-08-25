import { useSyncExternalStore } from "react";
import { conversionApi } from "../api/conversion";
import type { InstallProgress } from "../types/conversion";

export interface EngineInstallState {
  stage: InstallProgress["stage"] | "idle";
  progress: number;
  message: string;
  determinate: boolean;
  error: string | null;
}

const idleState: EngineInstallState = {
  stage: "idle",
  progress: 0,
  message: "",
  determinate: true,
  error: null,
};

let state: EngineInstallState = idleState;
const listeners = new Set<() => void>();
let listening = false;

const ACTIVE_STAGES = new Set<EngineInstallState["stage"]>([
  "resolving_version",
  "downloading",
  "verifying",
  "installing",
]);

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<EngineInstallState>) {
  state = { ...state, ...patch };
  emit();
}

async function ensureListening() {
  if (listening) return;
  listening = true;
  await conversionApi.onInstallProgress((p) => {
    setState({
      stage: p.stage,
      progress: p.progress,
      message: p.message,
      determinate: p.determinate,
      error: p.stage === "failed" ? p.message : null,
    });
  });
}

/**
 * Drives the "一键安装 LibreOffice" flow: fed by the `engine://install-progress`
 * event stream from the Rust `install_conversion_engine` command
 * (src-tauri/src/conversion/installer.rs), same push-not-poll pattern as
 * `taskStore`'s `conversion://task-updated`.
 */
export const engineInstallStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return state;
  },
  async install() {
    // Only block re-entry while a previous attempt is genuinely still in
    // flight — NOT whenever stage is merely "not idle". An earlier version
    // of this guard checked `stage !== "idle"`, which meant that once one
    // attempt ended (either "done" or "failed"), every later click became a
    // silent no-op forever: no dialog, no progress, nothing, because we
    // returned before ever calling installEngine() again. Retrying after a
    // failure (or reinstalling after a completed one) must stay possible.
    if (ACTIVE_STAGES.has(state.stage)) return;
    setState({ stage: "resolving_version", progress: 0, message: "正在准备…", determinate: true, error: null });
    await ensureListening();
    try {
      await conversionApi.installEngine();
    } catch (e) {
      setState({ stage: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  },
  reset() {
    state = idleState;
    emit();
  },
};

export function useEngineInstall(): EngineInstallState {
  return useSyncExternalStore(engineInstallStore.subscribe, engineInstallStore.getSnapshot);
}
