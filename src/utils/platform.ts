/**
 * Best-effort OS detection from the webview's own navigator — good enough
 * to choose the right shortcut glyph (⌘ vs Ctrl) and avoids pulling in
 * `@tauri-apps/plugin-os` for a single boolean.
 */
export const isMac =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent || "");

export function modKeyLabel(): string {
  return isMac ? "⌘" : "Ctrl";
}

export function formatShortcut(key: string): string {
  return `${modKeyLabel()}${isMac ? "" : "+"}${key}`;
}
