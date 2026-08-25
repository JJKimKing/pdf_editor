import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import type { ViewId } from "../app/routes";
import { historyApi } from "../api/history";
import { EmptyState } from "../components/shell/EmptyState";
import { HistoryIcon } from "../components/shell/icons";
import { ensureFileExists } from "../services/missingFileGuard";
import { contextMenuStore } from "../stores/contextMenuStore";
import { dialogStore } from "../stores/dialogStore";
import { handoffStore } from "../stores/handoffStore";
import { toastStore } from "../stores/toastStore";
import {
  HISTORY_STATUS_LABEL,
  OPERATION_LABEL,
  type HistoryEntry,
  type HistoryOperation,
} from "../types/history";
import { extOf, formatFileSize, formatHistoryTime } from "../utils/format";
import "./HistoryPage.css";

const PAGE_SIZE = 12;

const VIEW_FOR_OPERATION: Record<HistoryOperation, ViewId> = {
  pdf_to_docx: "pdf-to-docx",
  docx_to_pdf: "docx-to-pdf",
  metadata_write: "metadata",
  grayscale_images: "grayscale",
};

interface Props {
  onNavigate: (view: ViewId) => void;
}

export function HistoryPage({ onNavigate }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<HistoryOperation | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const op = filter === "all" ? undefined : filter;
    Promise.all([
      historyApi.list(PAGE_SIZE, page * PAGE_SIZE, op),
      historyApi.count(op),
    ])
      .then(([rows, count]) => {
        setEntries(rows);
        setTotal(count);
      })
      .catch((err) => toastStore.push("error", String(err)))
      .finally(() => setLoading(false));
  }, [page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function withExisting(entry: HistoryEntry, path: string, action: (p: string) => void) {
    const resolved = await ensureFileExists(path, extOf(path), async () => {
      await historyApi.remove(entry.id);
      load();
    });
    if (resolved) action(resolved);
  }

  async function openResult(entry: HistoryEntry) {
    await withExisting(entry, entry.outputPath ?? entry.sourcePath, (p) =>
      openPath(p).catch(() => toastStore.push("error", "无法打开文件")),
    );
  }

  async function revealResult(entry: HistoryEntry) {
    await withExisting(entry, entry.outputPath ?? entry.sourcePath, (p) =>
      revealItemInDir(p).catch(() => toastStore.push("error", "无法定位文件")),
    );
  }

  async function reprocess(entry: HistoryEntry) {
    await withExisting(entry, entry.sourcePath, (p) => {
      const view = VIEW_FOR_OPERATION[entry.operation];
      handoffStore.set(view, [p]);
      onNavigate(view);
    });
  }

  async function removeEntry(entry: HistoryEntry) {
    await historyApi.remove(entry.id);
    load();
  }

  async function clearAll() {
    const choice = await dialogStore.confirm({
      title: "清空全部历史记录？",
      message: "这只会移除记录，不会删除磁盘上的文件。",
      actions: [
        { label: "清空", value: "clear", variant: "danger" },
        { label: "取消", value: "cancel" },
      ],
    });
    if (choice !== "clear") return;
    await historyApi.clear();
    load();
  }

  return (
    <div className="history-page">
      <div className="history-page__header">
        <div>
          <h1 className="history-page__title">历史记录</h1>
          <p className="history-page__subtitle">查看所有处理记录</p>
        </div>
        <div className="history-page__header-actions">
          <select
            className="history-page__filter"
            value={filter}
            onChange={(e) => {
              setPage(0);
              setFilter(e.target.value as HistoryOperation | "all");
            }}
          >
            <option value="all">全部类型</option>
            <option value="pdf_to_docx">PDF → DOCX</option>
            <option value="docx_to_pdf">DOCX → PDF</option>
            <option value="metadata_write">元数据编辑</option>
            <option value="grayscale_images">图片灰度化</option>
          </select>
          {total > 0 && (
            <button type="button" className="history-page__clear" onClick={clearAll}>
              清空历史
            </button>
          )}
        </div>
      </div>

      {!loading && entries.length === 0 ? (
        <EmptyState icon={<HistoryIcon />} title="还没有处理记录" description="转换或编辑过的文件会显示在这里" />
      ) : (
        <>
          <div className="history-table">
            <div className="history-table__row history-table__row--head">
              <span>文件名</span>
              <span>操作</span>
              <span>大小</span>
              <span>结果</span>
              <span>时间</span>
              <span>操作</span>
            </div>
            <div className="history-table__body">
              {entries.map((entry) => (
                <div
                  className="history-table__row"
                  key={entry.id}
                  onContextMenu={(e) =>
                    contextMenuStore.open(e, [
                      { label: "打开结果", onSelect: () => openResult(entry) },
                      { label: "打开目录", onSelect: () => revealResult(entry) },
                      { label: "重新处理", onSelect: () => reprocess(entry) },
                      { label: "删除记录", onSelect: () => removeEntry(entry), danger: true },
                    ])
                  }
                >
                  <span className="history-table__name" title={entry.sourceName}>
                    {entry.sourceName}
                  </span>
                  <span>{OPERATION_LABEL[entry.operation]}</span>
                  <span>{formatFileSize(entry.fileSize)}</span>
                  <span>
                    <span className={`history-table__status history-table__status--${entry.status}`}>
                      {HISTORY_STATUS_LABEL[entry.status]}
                    </span>
                  </span>
                  <span>{formatHistoryTime(entry.createdAt)}</span>
                  <span className="history-table__actions">
                    <button type="button" onClick={() => openResult(entry)}>
                      打开结果
                    </button>
                    <button type="button" onClick={() => reprocess(entry)}>
                      重新处理
                    </button>
                    <button type="button" className="history-table__danger" onClick={() => removeEntry(entry)}>
                      删除
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {pageCount > 1 && (
            <div className="history-page__pagination">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                上一页
              </button>
              <span>
                第 {page + 1} / {pageCount} 页
              </span>
              <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
