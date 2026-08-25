import { open } from "@tauri-apps/plugin-dialog";
import { historyApi } from "../api/history";
import { dialogStore } from "../stores/dialogStore";

/**
 * Shared "the file behind this history/recent-files row might have been
 * moved or deleted" check (product spec §29) — used before opening,
 * revealing, or reprocessing a path recorded earlier. Returns the path to
 * actually use (the original if it still exists, a user-located
 * replacement, or `null` if the caller should abort — including when the
 * user chose to remove the row, which `onRemove` performs).
 */
export async function ensureFileExists(
  path: string,
  extensionFilter: string,
  onRemove: () => void | Promise<void>,
): Promise<string | null> {
  const exists = await historyApi.pathExists(path);
  if (exists) return path;

  const choice = await dialogStore.confirm({
    title: "文件已被移动或删除",
    message: path,
    actions: [
      { label: "定位文件", value: "locate", variant: "primary" },
      { label: "从历史记录移除", value: "remove", variant: "danger" },
      { label: "取消", value: "cancel" },
    ],
  });

  if (choice === "locate") {
    const selected = await open({
      multiple: false,
      filters: [{ name: extensionFilter.toUpperCase(), extensions: [extensionFilter] }],
    });
    return typeof selected === "string" ? selected : null;
  }
  if (choice === "remove") {
    await onRemove();
  }
  return null;
}
