import { useSyncExternalStore } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

let current: ContextMenuState | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** App-wide right-click menu (see product spec §39) — one host, many callers. */
export const contextMenuStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return current;
  },
  open(event: { clientX: number; clientY: number; preventDefault: () => void }, items: ContextMenuItem[]) {
    event.preventDefault();
    current = { x: event.clientX, y: event.clientY, items };
    emit();
  },
  close() {
    current = null;
    emit();
  },
};

export function useContextMenuState() {
  return useSyncExternalStore(contextMenuStore.subscribe, contextMenuStore.getSnapshot);
}
