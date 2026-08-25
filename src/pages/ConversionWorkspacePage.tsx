import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ViewId } from "../app/routes";
import { conversionApi } from "../api/conversion";
import { settingsApi } from "../api/settings";
import { FileTable, type WorkspaceRow } from "../components/conversion/FileTable";
import { TaskBar } from "../components/conversion/TaskBar";
import { EmptyState } from "../components/shell/EmptyState";
import { FolderIcon } from "../components/shell/icons";
import { useFileDrop } from "../services/fileDropService";
import { useShortcut } from "../hooks/useShortcut";
import { dialogStore } from "../stores/dialogStore";
import { engineInstallStore, useEngineInstall } from "../stores/engineInstallStore";
import { handoffStore } from "../stores/handoffStore";
import { useTasks } from "../stores/taskStore";
import { toastStore } from "../stores/toastStore";
import type { DuplicatePolicy, TaskType } from "../types/conversion";
import { dirOf } from "../utils/format";
import "./ConversionWorkspacePage.css";

interface Props {
  taskType: TaskType;
  viewId: ViewId;
  title: string;
  subtitle: string;
  icon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}

export function ConversionWorkspacePage({
  taskType,
  viewId,
  title,
  subtitle,
  icon,
  emptyTitle,
  emptyDescription,
}: Props) {
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [outputDir, setOutputDir] = useState("");
  const [openAfter, setOpenAfter] = useState(true);
  const [defaultPolicy, setDefaultPolicy] = useState<DuplicatePolicy>("rename");
  const allTasks = useTasks();
  const engineInstall = useEngineInstall();
  const installingEngine =
    engineInstall.stage !== "idle" && engineInstall.stage !== "done" && engineInstall.stage !== "failed";
  const acceptExt = taskType === "pdf_to_docx" ? "pdf" : "docx";
  const targetExt = taskType === "pdf_to_docx" ? "docx" : "pdf";

  const tasksById = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const liveRows = useMemo(
    () => rows.map((r) => (r.task ? { ...r, task: tasksById.get(r.task.id) ?? r.task } : r)),
    [rows, tasksById],
  );

  useEffect(() => {
    settingsApi.get().then((s) => {
      if (s.defaultOutputDir) setOutputDir(s.defaultOutputDir);
      setOpenAfter(s.openFolderAfterConversion);
      setDefaultPolicy(s.duplicatePolicy);
    });
  }, []);

  useEffect(() => {
    const handed = handoffStore.consume(viewId);
    if (handed && handed.length > 0) void addFiles(handed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);

  useShortcut("o", () => void pickFiles());

  const revealedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!openAfter) return;
    for (const row of liveRows) {
      if (row.task?.status === "success" && row.task.outputPath && !revealedRef.current.has(row.task.id)) {
        revealedRef.current.add(row.task.id);
        revealItemInDir(row.task.outputPath).catch(() => {});
      }
    }
  }, [liveRows, openAfter]);

  async function addFiles(paths: string[]) {
    const existing = new Set(rows.map((r) => r.path));
    const uniquePaths = paths.filter((p) => {
      if (existing.has(p)) return false;
      existing.add(p);
      return true;
    });
    const dupCount = paths.length - uniquePaths.length;
    if (dupCount > 0) toastStore.push("info", `已跳过 ${dupCount} 个重复文件`);
    if (uniquePaths.length === 0) return;

    const infos = await conversionApi.inspectSourceFiles(uniquePaths, taskType);
    const invalid = infos.filter((i) => !i.valid);
    if (invalid.length > 0) {
      toastStore.push("warning", `${invalid.length} 个文件无法添加：${invalid[0].error}`);
    }
    const valid = infos.filter((i) => i.valid);
    if (valid.length > 0) {
      toastStore.push("success", `已添加 ${valid.length} 个文件`);
      setOutputDir((prev) => prev || dirOf(valid[0].path));
    }
    setRows((prev) => [...prev, ...infos.map((info) => ({ key: crypto.randomUUID(), path: info.path, info, task: null }))]);
  }

  const { isOver } = useFileDrop([acceptExt], addFiles);

  async function pickFiles() {
    const selected = await open({
      multiple: true,
      filters: [{ name: acceptExt.toUpperCase(), extensions: [acceptExt] }],
    });
    if (!selected) return;
    void addFiles(Array.isArray(selected) ? selected : [selected]);
  }

  async function pickFolder() {
    const selected = await open({ directory: true });
    if (!selected || Array.isArray(selected)) return;
    const choice = await dialogStore.confirm({
      title: "是否包含子文件夹？",
      message: selected,
      actions: [
        { label: "包含子文件夹", value: "recursive" },
        { label: "仅当前文件夹", value: "flat", variant: "primary" },
      ],
    });
    const files = await conversionApi.scanFolder(selected, taskType, choice === "recursive");
    if (files.length === 0) {
      toastStore.push("info", "该文件夹中没有找到匹配的文件");
      return;
    }
    void addFiles(files);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function resolvePolicy(paths: string[]): Promise<DuplicatePolicy | null> {
    if (defaultPolicy !== "ask") return defaultPolicy;
    const conflicts = await conversionApi.checkOutputConflicts(paths, outputDir, targetExt);
    if (conflicts.length === 0) return "rename";
    const choice = await dialogStore.confirm({
      title: `${conflicts.length} 个文件在目标目录已存在同名文件`,
      message: "如何处理？",
      actions: [
        { label: "自动重命名", value: "rename", variant: "primary" },
        { label: "覆盖", value: "overwrite", variant: "danger" },
        { label: "取消", value: "cancel" },
      ],
    });
    if (choice === "cancel") return null;
    return choice as DuplicatePolicy;
  }

  async function startConversion(targetRows: WorkspaceRow[]) {
    if (targetRows.length === 0) return;
    if (!outputDir) {
      toastStore.push("warning", "请先选择输出目录");
      return;
    }
    const engineOk = await conversionApi.checkEngine();
    if (!engineOk) {
      const choice = await dialogStore.confirm({
        title: "未检测到转换程序",
        message: "PDF ↔ DOCX 转换需要 LibreOffice，是否现在一键安装？",
        actions: [
          { label: "一键安装", value: "install", variant: "primary" },
          { label: "取消", value: "cancel" },
        ],
      });
      if (choice === "install") {
        // Progress from here on is shown by the persistent banner bound to
        // `useEngineInstall()` below, not a toast — a multi-minute download
        // needs a live indicator, not a message that auto-dismisses in 3.5s.
        await engineInstallStore.install();
        const nowOk = await conversionApi.checkEngine();
        if (nowOk) {
          toastStore.push("success", "安装完成，请重新点击开始转换");
        } else {
          toastStore.push(
            "error",
            engineInstallStore.getSnapshot().error || "安装未完成，请重试或前往设置页手动安装",
          );
        }
      }
      return;
    }
    const paths = targetRows.map((r) => r.path);
    const policy = await resolvePolicy(paths);
    if (!policy) return;

    const created = await conversionApi.start(taskType, paths, outputDir, policy);
    setRows((prev) =>
      prev.map((r) => {
        const idx = paths.indexOf(r.path);
        return idx === -1 ? r : { ...r, task: created[idx] };
      }),
    );
  }

  const eligibleRows = liveRows.filter(
    (r) => r.info.valid && (!r.task || r.task.status === "failed" || r.task.status === "cancelled"),
  );
  const hasActive = liveRows.some((r) => r.task?.status === "queued" || r.task?.status === "processing");

  function cancelAll() {
    liveRows
      .filter((r) => r.task?.status === "queued" || r.task?.status === "processing")
      .forEach((r) => r.task && conversionApi.cancel(r.task.id));
  }

  return (
    <div className={`conversion-page${isOver ? " conversion-page--drop-over" : ""}`}>
      <div className="conversion-page__header">
        <div>
          <h1 className="conversion-page__title">{title}</h1>
          <p className="conversion-page__subtitle">{subtitle}</p>
        </div>
        <div className="conversion-page__header-actions">
          <button type="button" className="conversion-page__header-button" onClick={pickFiles}>
            添加文件
          </button>
          <button type="button" className="conversion-page__header-button" onClick={pickFolder}>
            <FolderIcon />
            添加文件夹
          </button>
        </div>
      </div>

      {installingEngine && (
        <div className="conversion-page__engine-banner">
          <div
            className={`conversion-page__engine-banner__bar${
              engineInstall.determinate ? "" : " conversion-page__engine-banner__bar--indeterminate"
            }`}
          >
            {engineInstall.determinate ? (
              <div
                className="conversion-page__engine-banner__fill"
                style={{ width: `${Math.max(4, engineInstall.progress)}%` }}
              />
            ) : (
              <div className="conversion-page__engine-banner__fill conversion-page__engine-banner__fill--indeterminate" />
            )}
          </div>
          <span className="conversion-page__engine-banner__message">{engineInstall.message}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          action={
            <button type="button" className="conversion-page__empty-button" onClick={pickFiles}>
              选择{acceptExt.toUpperCase()}文件
            </button>
          }
        />
      ) : (
        <div className="conversion-page__body">
          <FileTable
            rows={liveRows}
            onRemove={removeRow}
            onCancel={(id) => conversionApi.cancel(id)}
            onRetry={(row) => void startConversion([row])}
          />
        </div>
      )}

      <TaskBar
        outputDir={outputDir}
        onChangeOutputDir={setOutputDir}
        openAfter={openAfter}
        onChangeOpenAfter={setOpenAfter}
        onStart={() => void startConversion(eligibleRows)}
        onCancelAll={cancelAll}
        canStart={eligibleRows.length > 0 && !hasActive}
        hasActive={hasActive}
      />
    </div>
  );
}
