import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { toastStore } from "../stores/toastStore";

export type AcceptKind = "pdf" | "docx";

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

/**
 * Single source of truth for native file drag & drop (see product spec
 * §41 — one File Drop Service, not one ad-hoc implementation per page).
 * Uses the webview's real OS drag-drop event (absolute paths), not the
 * HTML5 DataTransfer API, so dropped files work the same as picker-selected
 * ones everywhere downstream.
 */
export function useFileDrop(accept: AcceptKind[], onFiles: (paths: string[]) => void) {
  const [isOver, setIsOver] = useState(false);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const acceptKey = accept.join(",");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setIsOver(true);
          return;
        }
        if (payload.type === "leave") {
          setIsOver(false);
          return;
        }
        if (payload.type === "drop") {
          setIsOver(false);
          const acceptSet = new Set(acceptKey.split(",").filter(Boolean));
          const accepted: string[] = [];
          let rejected = 0;
          for (const p of payload.paths) {
            if (acceptSet.has(extOf(p))) accepted.push(p);
            else rejected++;
          }
          if (rejected > 0) {
            toastStore.push(
              "warning",
              rejected === payload.paths.length
                ? "不支持此文件格式"
                : `已忽略 ${rejected} 个不支持的文件`,
            );
          }
          if (accepted.length > 0) onFilesRef.current(accepted);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [acceptKey]);

  return { isOver };
}
