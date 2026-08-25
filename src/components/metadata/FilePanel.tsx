import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { useMemo, useState } from "react";
import { contextMenuStore } from "../../stores/contextMenuStore";
import { FolderIcon } from "../shell/icons";
import type { PdfBasicInfo } from "../../types/pdf";
import { formatFileSize } from "../../utils/format";
import "./FilePanel.css";

interface Props {
  files: PdfBasicInfo[];
  activeId: string | null;
  selectedIds: Set<string>;
  dirtyIds: Set<string>;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
}

export function FilePanel({
  files,
  activeId,
  selectedIds,
  dirtyIds,
  onSelect,
  onToggleSelect,
  onRemove,
  onAddFiles,
  onAddFolder,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.trim().toLowerCase();
    return files.filter((f) => f.fileName.toLowerCase().includes(q));
  }, [files, query]);

  return (
    <aside className="metadata-file-panel">
      <div className="metadata-file-panel__toolbar">
        <button type="button" className="metadata-file-panel__toolbar-btn" onClick={onAddFiles}>
          添加文件
        </button>
        <button type="button" className="metadata-file-panel__toolbar-btn" onClick={onAddFolder}>
          <FolderIcon />
          添加目录
        </button>
      </div>

      <input
        className="metadata-file-panel__search"
        placeholder="搜索 PDF..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {files.length === 0 ? (
        <div className="metadata-file-panel__empty">
          <p>尚未添加 PDF 文件</p>
          <p className="metadata-file-panel__empty-hint">点击上方"添加文件"或"添加目录"开始</p>
        </div>
      ) : (
        <ul className="metadata-file-panel__list">
          {filtered.map((file) => {
            const isActive = file.id === activeId;
            const isChecked = selectedIds.has(file.id);
            const isDirty = dirtyIds.has(file.id);
            return (
              <li
                key={file.id}
                className={`metadata-file-item${isActive ? " metadata-file-item--active" : ""}`}
                onClick={(e) => onSelect(file.id, e)}
                onContextMenu={(e) =>
                  contextMenuStore.open(e, [
                    { label: "打开", onSelect: () => openPath(file.filePath) },
                    { label: "在文件夹中显示", onSelect: () => revealItemInDir(file.filePath) },
                    { label: "从列表移除", onSelect: () => onRemove(file.id), danger: true },
                  ])
                }
              >
                <input
                  type="checkbox"
                  className="metadata-file-item__checkbox"
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleSelect(file.id)}
                />
                <div className="metadata-file-item__body">
                  <div className="metadata-file-item__name" title={file.fileName}>
                    {file.fileName}
                    {isDirty && <span className="metadata-file-item__dirty-dot" title="有未保存的修改" />}
                  </div>
                  <div className="metadata-file-item__meta">
                    {formatFileSize(file.fileSize)} · {file.pageCount} 页
                  </div>
                </div>
                <button
                  type="button"
                  className="metadata-file-item__remove"
                  title="移除"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(file.id);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
