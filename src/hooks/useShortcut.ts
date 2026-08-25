import { useEffect, useRef } from "react";
import { isMac } from "../utils/platform";

/**
 * Registers a Cmd (mac) / Ctrl (windows/linux) + key shortcut for as long as
 * the calling component is mounted. `enabled` lets a page register the same
 * key differently (or not at all) depending on context without unmounting.
 */
export function useShortcut(key: string, handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        handlerRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, enabled]);
}
