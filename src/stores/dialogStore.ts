import { useSyncExternalStore } from "react";

export interface DialogAction {
  label: string;
  value: string;
  variant?: "primary" | "danger" | "default";
}

export interface DialogRequest {
  title: string;
  message?: string;
  actions: DialogAction[];
}

let current: DialogRequest | null = null;
let resolver: ((value: string) => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * App-wide confirm/choice dialog (unsaved changes, overwrite, remove, error
 * detail, …) — see product spec §43. One `<Dialog />` mounted at the app
 * root renders whatever's `current`; call sites just `await` the choice.
 */
export const dialogStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return current;
  },
  confirm(request: DialogRequest): Promise<string> {
    return new Promise((resolve) => {
      current = request;
      resolver = resolve;
      emit();
    });
  },
  resolve(value: string) {
    resolver?.(value);
    current = null;
    resolver = null;
    emit();
  },
};

export function useDialogRequest() {
  return useSyncExternalStore(dialogStore.subscribe, dialogStore.getSnapshot);
}
