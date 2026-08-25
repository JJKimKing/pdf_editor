import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../types/settings";

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  update: (settings: Settings) => invoke<Settings>("update_settings", { settings }),
};
