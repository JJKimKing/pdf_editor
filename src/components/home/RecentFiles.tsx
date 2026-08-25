import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { ViewId } from "../../app/routes";
import { historyApi } from "../../api/history";
import { ensureFileExists } from "../../services/missingFileGuard";
import { contextMenuStore } from "../../stores/contextMenuStore";
import { handoffStore } from "../../stores/handoffStore";
import { toastStore } from "../../stores/toastStore";
import { HISTORY_STATUS_LABEL, type HistoryEntry, type HistoryOperation } from "../../types/history";
import { extOf, fileNameOf, formatFileSize, formatRelativeTime } from "../../utils/format";
import "./RecentFiles.css";

const VIEW_FOR_OPERATION: Record<HistoryOperation, ViewId> = {
  pdf_to_docx: "pdf-to-docx",
  docx_to_pdf: "docx-to-pdf",
  metadata_write: "metadata",
  grayscale_images: "grayscale",
};

interface Props {
  onNavigate: (view: ViewId) => void;
}

export function RecentFiles({ onNavigate }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    historyApi.list(8).then(setEntries).catch(() => setEntries([]));
  }, []);

  async function reprocess(entry: HistoryEntry) {
    const path = await ensureFileExists(entry.sourcePath, extOf(entry.sourcePath), async () => {
      await historyApi.remove(entry.id);
      setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null);
    });
    if (!path) return;
    const view = VIEW_FOR_OPERATION[entry.operation];
    handoffStore.set(view, [path]);
    onNavigate(view);
  }

  async function openResult(entry: HistoryEntry) {
    const target = entry.outputPath ?? entry.sourcePath;
    const path = await ensureFileExists(target, extOf(target), async () => {
      await historyApi.remove(entry.id);
      setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null);
    });
    if (!path) return;
    try {
      await openPath(path);
    } catch {
      toastStore.push("error", "无法打开文件");
    }
  }

  async function reveal(entry: HistoryEntry) {
    const target = entry.outputPath ?? entry.sourcePath;
    const path = await ensureFileExists(target, extOf(target), async () => {
      await historyApi.remove(entry.id);
      setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null);
    });
    if (!path) return;
    try {
      await revealItemInDir(path);
    } catch {
      toastStore.push("error", "无法定位文件");
    }
  }

  async function removeEntry(entry: HistoryEntry) {
    await historyApi.remove(entry.id);
    setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null);
  }

  return (
    <div className="recent-files">
      <div className="recent-files__header">最近文件</div>
      {entries === null ? (
        <div className="recent-files__placeholder">加载中…</div>
      ) : entries.length === 0 ? (
        <div className="recent-files__placeholder">还没有处理记录</div>
      ) : (
        <div className="recent-files__list">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="recent-files__item"
              onClick={() => reprocess(entry)}
              onContextMenu={(e) =>
                contextMenuStore.open(e, [
                  { label: "打开", onSelect: () => openResult(entry) },
                  { label: "在文件夹中显示", onSelect: () => reveal(entry) },
                  { label: "再次处理", onSelect: () => reprocess(entry) },
                  { label: "从历史记录移除", onSelect: () => removeEntry(entry), danger: true },
                ])
              }
            >
              <span className={`recent-files__badge recent-files__badge--${extOf(entry.sourceName)}`}>
                {extOf(entry.sourceName).toUpperCase()}
              </span>
              <div className="recent-files__info">
                <div className="recent-files__name">{fileNameOf(entry.sourceName)}</div>
                <div className="recent-files__meta">
                  {extOf(entry.sourceName).toUpperCase()} · {formatFileSize(entry.fileSize)} ·{" "}
                  {formatRelativeTime(entry.createdAt)}
                  {entry.status !== "success" && (
                    <span className="recent-files__status"> · {HISTORY_STATUS_LABEL[entry.status]}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
