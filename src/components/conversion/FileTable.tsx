import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { dialogStore } from "../../stores/dialogStore";
import { toastStore } from "../../stores/toastStore";
import { TASK_STATUS_LABEL, type ConversionTask, type SourceFileInfo } from "../../types/conversion";
import { formatFileSize } from "../../utils/format";
import "./FileTable.css";

export interface WorkspaceRow {
  key: string;
  path: string;
  info: SourceFileInfo;
  task: ConversionTask | null;
}

interface RowCallbacks {
  onRemove: (key: string) => void;
  onCancel: (taskId: string) => void;
  onRetry: (row: WorkspaceRow) => void;
}

interface Props extends RowCallbacks {
  rows: WorkspaceRow[];
}

async function showErrorDetail(task: ConversionTask) {
  await dialogStore.confirm({
    title: task.error ?? "转换失败",
    message: task.errorDetail ?? undefined,
    actions: [{ label: "关闭", value: "close", variant: "primary" }],
  });
}

export function FileTable({ rows, onRemove, onCancel, onRetry }: Props) {
  return (
    <div className="file-table">
      <div className="file-table__row file-table__row--head">
        <span className="file-table__col file-table__col--name">文件名</span>
        <span className="file-table__col file-table__col--size">大小</span>
        <span className="file-table__col file-table__col--pages">页数</span>
        <span className="file-table__col file-table__col--status">状态</span>
        <span className="file-table__col file-table__col--progress">进度</span>
        <span className="file-table__col file-table__col--actions">操作</span>
      </div>
      <div className="file-table__body">
        {rows.map((row) => (
          <div className="file-table__row" key={row.key}>
            <span className="file-table__col file-table__col--name" title={row.info.name}>
              {row.info.name}
            </span>
            <span className="file-table__col file-table__col--size">{formatFileSize(row.info.size)}</span>
            <span className="file-table__col file-table__col--pages">
              {row.info.pageCount ?? "—"}
            </span>
            <span className="file-table__col file-table__col--status">
              <StatusBadge row={row} />
            </span>
            <span className="file-table__col file-table__col--progress">
              <ProgressCell row={row} />
            </span>
            <span className="file-table__col file-table__col--actions">
              <RowActions row={row} onRemove={onRemove} onCancel={onCancel} onRetry={onRetry} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: WorkspaceRow }) {
  if (!row.info.valid) {
    return <span className="status-badge status-badge--failed">无效文件</span>;
  }
  const status = row.task?.status ?? "queued";
  return <span className={`status-badge status-badge--${status}`}>{TASK_STATUS_LABEL[status]}</span>;
}

function ProgressCell({ row }: { row: WorkspaceRow }) {
  if (!row.info.valid) return <span className="file-table__muted">{row.info.error}</span>;
  const status = row.task?.status;
  if (status === "processing") {
    return (
      <div className="progress-bar progress-bar--indeterminate">
        <div className="progress-bar__fill" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <button type="button" className="file-table__link" onClick={() => row.task && showErrorDetail(row.task)}>
        查看详情
      </button>
    );
  }
  return <span className="file-table__muted">—</span>;
}

function RowActions({ row, onRemove, onCancel, onRetry }: RowCallbacks & { row: WorkspaceRow }) {
  const status = row.task?.status;

  if (!row.task || status === "queued") {
    return (
      <button type="button" className="file-table__action" onClick={() => onRemove(row.key)}>
        移除
      </button>
    );
  }
  if (status === "processing") {
    return (
      <button type="button" className="file-table__action" onClick={() => onCancel(row.task!.id)}>
        取消
      </button>
    );
  }
  if (status === "success") {
    const outputPath = row.task.outputPath;
    return (
      <div className="file-table__action-group">
        <button
          type="button"
          className="file-table__action"
          onClick={() => outputPath && openPath(outputPath).catch(() => toastStore.push("error", "无法打开文件"))}
        >
          打开
        </button>
        <button
          type="button"
          className="file-table__action"
          onClick={() =>
            outputPath && revealItemInDir(outputPath).catch(() => toastStore.push("error", "无法定位文件"))
          }
        >
          打开目录
        </button>
        <button type="button" className="file-table__action" onClick={() => onRetry(row)}>
          再次转换
        </button>
      </div>
    );
  }
  // failed | cancelled
  return (
    <div className="file-table__action-group">
      <button type="button" className="file-table__action" onClick={() => onRetry(row)}>
        重试
      </button>
      <button type="button" className="file-table__action" onClick={() => onRemove(row.key)}>
        移除
      </button>
    </div>
  );
}
