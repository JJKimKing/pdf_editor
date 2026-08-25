import { useSyncExternalStore } from "react";

export type ToastType = "success" | "info" | "warning" | "error";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * App-wide toast queue. Every part of the app pushes through this instead
 * of `alert()`/inline banners, so notifications look and behave the same
 * everywhere (see product spec §42).
 */
export const toastStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return toasts;
  },
  push(type: ToastType, message: string, durationMs = 3500) {
    const id = crypto.randomUUID();
    toasts = [...toasts, { id, type, message }];
    emit();
    setTimeout(() => toastStore.dismiss(id), durationMs);
    return id;
  },
  dismiss(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },
};

export function useToasts() {
  return useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
}
