/** Mirrors src-tauri/src/settings/mod.rs::Settings — keep both in sync. */

export type ThemePreference = "system" | "light" | "dark";

export interface Settings {
  launchAtStartup: boolean;
  openFolderAfterConversion: boolean;
  defaultOutputDir: string | null;
  duplicatePolicy: "ask" | "rename" | "overwrite";
  maxConcurrency: number;
  theme: ThemePreference;
}
