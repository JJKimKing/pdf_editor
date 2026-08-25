import type { ThemePreference } from "../types/settings";

/** Applied both at startup and immediately when the user changes it in Settings. */
export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
