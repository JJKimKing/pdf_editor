import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry, HistoryOperation } from "../types/history";

export const historyApi = {
  list: (limit: number, offset = 0, operation?: HistoryOperation) =>
    invoke<HistoryEntry[]>("list_history", { limit, offset, operation: operation ?? null }),

  count: (operation?: HistoryOperation) => invoke<number>("count_history", { operation: operation ?? null }),

  remove: (id: string) => invoke<void>("delete_history_entry", { id }),

  clear: () => invoke<void>("clear_history"),

  pathExists: (path: string) => invoke<boolean>("check_path_exists", { path }),
};
