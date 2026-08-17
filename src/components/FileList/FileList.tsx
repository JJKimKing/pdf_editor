import type { PdfBasicInfo } from "../../types/pdf";
import { formatFileSize } from "../../utils/format";
import "./FileList.css";

interface FileListProps {
  files: PdfBasicInfo[];
  activeId: string | null;
  selectedIds: Set<string>;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const STATUS_LABEL: Record<PdfBasicInfo["status"], string> = {
  unmodified: "未修改",
  modified: "已修改",
  error: "错误",
};

export function FileList({
  files,
  activeId,
  selectedIds,
  onSelect,
  onToggleSelect,
  onRemove,
}: FileListProps) {
  if (files.length === 0) {
    return (
      <aside className="file-list file-list--empty">
        <p>尚未添加 PDF 文件</p>
        <p className="file-list__hint">点击上方"添加文件"或"添加目录"开始</p>
      </aside>
    );
  }

  return (
    <aside className="file-list">
      <ul className="file-list__items">
        {files.map((file) => {
          const isActive = file.id === activeId;
          const isChecked = selectedIds.has(file.id);
          return (
            <li
              key={file.id}
              className={`file-item${isActive ? " file-item--active" : ""}`}
              onClick={(e) => onSelect(file.id, e)}
            >
              <input
                type="checkbox"
                className="file-item__checkbox"
                checked={isChecked}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelect(file.id)}
              />
              <div className="file-item__body">
                <div className="file-item__name" title={file.fileName}>
                  {file.fileName}
                </div>
                <div className="file-item__meta">
                  <span>{formatFileSize(file.fileSize)}</span>
                  <span className="file-item__dot">·</span>
                  <span>{file.pageCount} 页</span>
                  <span
                    className={`file-item__status file-item__status--${file.status}`}
                  >
                    {STATUS_LABEL[file.status]}
                  </span>
                </div>
              </div>
              <button
                className="file-item__remove"
                title="删除"
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
    </aside>
  );
}
