import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { pdfApi } from "../api/pdf";
import { BatchEditPanel } from "../components/metadata/BatchEditPanel";
import { FilePanel } from "../components/metadata/FilePanel";
import type { DraftFields } from "../components/metadata/MetadataTabs";
import { Workspace } from "../components/metadata/Workspace";
import { EmptyState } from "../components/shell/EmptyState";
import { MetadataIcon } from "../components/shell/icons";
import { useFileDrop } from "../services/fileDropService";
import { dialogStore } from "../stores/dialogStore";
import { handoffStore } from "../stores/handoffStore";
import { navigationGuard } from "../stores/navigationGuardStore";
import { toastStore } from "../stores/toastStore";
import type { MetadataPatch, PdfBasicInfo, PdfMetadata } from "../types/pdf";
import "./MetadataPage.css";

interface Props {
  onStatusChange: (context: string | undefined) => void;
}

function metadataToDraft(m: PdfMetadata): DraftFields {
  return {
    title: m.title ?? "",
    author: m.author ?? "",
    subject: m.subject ?? "",
    keywords: m.keywords ?? "",
    creator: m.creator ?? "",
  };
}

function buildPatch(draft: DraftFields, original: PdfMetadata): MetadataPatch {
  const patch: MetadataPatch = {};
  if (draft.title !== (original.title ?? "")) patch.title = draft.title;
  if (draft.author !== (original.author ?? "")) patch.author = draft.author;
  if (draft.subject !== (original.subject ?? "")) patch.subject = draft.subject;
  if (draft.keywords !== (original.keywords ?? "")) patch.keywords = draft.keywords;
  if (draft.creator !== (original.creator ?? "")) patch.creator = draft.creator;
  return patch;
}

export function MetadataPage({ onStatusChange }: Props) {
  const [files, setFiles] = useState<PdfBasicInfo[]>([]);
  const [metadataStore, setMetadataStore] = useState<Record<string, PdfMetadata>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeFile = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId]);
  const activeMetadata = activeId ? metadataStore[activeId] ?? null : null;
  const isBatchMode = selectedIds.size >= 2;

  useEffect(() => {
    if (!activeId) {
      setDraft(null);
      setDirty(false);
      return;
    }
    const cached = metadataStore[activeId];
    if (cached) {
      setDraft(metadataToDraft(cached));
      setDirty(false);
      return;
    }
    let cancelled = false;
    setMetadataLoading(true);
    pdfApi
      .getMetadata(activeId)
      .then((meta) => {
        if (cancelled) return;
        setMetadataStore((prev) => ({ ...prev, [activeId]: meta }));
        setDraft(metadataToDraft(meta));
        setDirty(false);
      })
      .catch((err) => toastStore.push("error", String(err)))
      .finally(() => {
        if (!cancelled) setMetadataLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    onStatusChange(
      `共 ${files.length} 个文件${selectedIds.size > 0 ? ` · 已选中 ${selectedIds.size} 个` : ""}`,
    );
    return () => onStatusChange(undefined);
  }, [files.length, selectedIds.size, onStatusChange]);

  async function confirmLeaveIfDirty(): Promise<boolean> {
    if (!dirty) return true;
    const choice = await dialogStore.confirm({
      title: "此文件有尚未保存的修改",
      actions: [
        { label: "保存并切换", value: "save", variant: "primary" },
        { label: "放弃修改", value: "discard", variant: "danger" },
        { label: "取消", value: "cancel" },
      ],
    });
    if (choice === "save") {
      await handleSave();
      return true;
    }
    if (choice === "discard") return true;
    return false;
  }

  useEffect(() => {
    navigationGuard.set(confirmLeaveIfDirty);
    return () => navigationGuard.set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft, activeId]);

  useEffect(() => {
    const handed = handoffStore.consume("metadata");
    if (handed && handed.length > 0) void addFiles(handed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(paths: string[]) {
    const existing = new Set(files.map((f) => f.filePath));
    const uniquePaths = paths.filter((p) => {
      if (existing.has(p)) return false;
      existing.add(p);
      return true;
    });
    if (paths.length > uniquePaths.length) {
      toastStore.push("info", `已跳过 ${paths.length - uniquePaths.length} 个重复文件`);
    }
    if (uniquePaths.length === 0) return;
    try {
      const added = await pdfApi.addFiles(uniquePaths);
      setFiles((prev) => [...prev, ...added]);
      toastStore.push("success", `已添加 ${added.length} 个 PDF 文件`);
      if (!activeId && added.length > 0) setActiveId(added[0].id);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  }

  const { isOver } = useFileDrop(["pdf"], addFiles);

  async function handleAddFiles() {
    const selected = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!selected) return;
    void addFiles(Array.isArray(selected) ? selected : [selected]);
  }

  async function handleAddFolder() {
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
    try {
      const added = await pdfApi.addFolder(selected, choice === "recursive");
      const existing = new Set(files.map((f) => f.filePath));
      const fresh = added.filter((f) => !existing.has(f.filePath));
      setFiles((prev) => [...prev, ...fresh]);
      if (fresh.length > 0) toastStore.push("success", `已添加 ${fresh.length} 个 PDF 文件`);
      if (!activeId && fresh.length > 0) setActiveId(fresh[0].id);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  }

  async function handleSelect(id: string, event: React.MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    if (id === activeId) return;
    const canLeave = await confirmLeaveIfDirty();
    if (!canLeave) return;
    setActiveId(id);
    setSelectedIds(new Set([id]));
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRemoveFile(id: string) {
    if (id === activeId) {
      const canLeave = await confirmLeaveIfDirty();
      if (!canLeave) return;
    }
    await pdfApi.removeFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeId === id) {
      setActiveId(null);
      setDraft(null);
      setDirty(false);
    }
  }

  function applyFileUpdate(id: string, meta: PdfMetadata) {
    setMetadataStore((prev) => ({ ...prev, [id]: meta }));
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "modified", modifiedAt: meta.modDate ?? f.modifiedAt } : f)),
    );
  }

  async function handleSave() {
    if (!activeId || !draft || !activeMetadata) return;
    const patch = buildPatch(draft, activeMetadata);
    if (Object.keys(patch).length === 0) {
      setDirty(false);
      return;
    }
    setSaving(true);
    try {
      const meta = await pdfApi.updateMetadata(activeId, patch);
      applyFileUpdate(activeId, meta);
      setDraft(metadataToDraft(meta));
      setDirty(false);
      toastStore.push("success", "元数据已保存");
    } catch (err) {
      toastStore.push("error", String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleReload() {
    if (!activeId) return;
    try {
      const meta = await pdfApi.getMetadata(activeId);
      applyFileUpdate(activeId, meta);
      setDraft(metadataToDraft(meta));
      setDirty(false);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  }

  async function handleClearMetadata() {
    if (!activeId) return;
    try {
      const meta = await pdfApi.clearMetadata(activeId);
      applyFileUpdate(activeId, meta);
      setDraft(metadataToDraft(meta));
      setDirty(false);
      toastStore.push("success", "元数据已清空");
    } catch (err) {
      toastStore.push("error", String(err));
    }
  }

  async function handleAddCustomField(key: string, value: string) {
    if (!activeId) return;
    try {
      const meta = await pdfApi.setCustomField(activeId, key, value);
      applyFileUpdate(activeId, meta);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  }

  async function handleRemoveCustomField(key: string) {
    if (!activeId) return;
    try {
      const meta = await pdfApi.removeCustomField(activeId, key);
      applyFileUpdate(activeId, meta);
    } catch (err) {
      toastStore.push("error", String(err));
    }
  }

  async function handleBatchUpdate(patch: MetadataPatch) {
    const results = await pdfApi.batchUpdateMetadata([...selectedIds], patch);
    const failed = results.filter((r) => !r.success);
    for (const r of results) {
      if (r.success) {
        setFiles((prev) => prev.map((f) => (f.id === r.id ? { ...f, status: "modified" } : f)));
        setMetadataStore((prev) => {
          const current = prev[r.id];
          return current ? { ...prev, [r.id]: { ...current, ...patch } } : prev;
        });
      }
    }
    if (failed.length > 0) toastStore.push("error", `${failed.length} 个文件处理失败：${failed[0].error ?? "未知错误"}`);
    else toastStore.push("success", `已更新 ${results.length} 个文件`);
  }

  async function handleBatchClear() {
    const results = await pdfApi.batchClearMetadata([...selectedIds]);
    const failed = results.filter((r) => !r.success);
    for (const r of results) {
      if (r.success) {
        setFiles((prev) => prev.map((f) => (f.id === r.id ? { ...f, status: "modified" } : f)));
        setMetadataStore((prev) => {
          const current = prev[r.id];
          return current
            ? { ...prev, [r.id]: { ...current, title: null, author: null, subject: null, keywords: null, creator: null } }
            : prev;
        });
      }
    }
    if (failed.length > 0) toastStore.push("error", `${failed.length} 个文件处理失败：${failed[0].error ?? "未知错误"}`);
    else toastStore.push("success", `已清空 ${results.length} 个文件的元数据`);
  }

  return (
    <div className={`metadata-page${isOver ? " metadata-page--drop-over" : ""}`}>
      <FilePanel
        files={files}
        activeId={activeId}
        selectedIds={selectedIds}
        dirtyIds={dirty && activeId ? new Set([activeId]) : new Set()}
        onSelect={handleSelect}
        onToggleSelect={handleToggleSelect}
        onRemove={handleRemoveFile}
        onAddFiles={handleAddFiles}
        onAddFolder={handleAddFolder}
      />

      {isBatchMode ? (
        <BatchEditPanel count={selectedIds.size} onApply={handleBatchUpdate} onClearAll={handleBatchClear} />
      ) : activeFile && draft ? (
        metadataLoading && !activeMetadata ? (
          <div className="metadata-page__loading">正在读取 PDF 元数据…</div>
        ) : activeMetadata ? (
          <Workspace
            file={activeFile}
            metadata={activeMetadata}
            draft={draft}
            dirty={dirty}
            saving={saving}
            onDraftChange={(patch) => {
              setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
              setDirty(true);
            }}
            onSave={handleSave}
            onReload={handleReload}
            onClearMetadata={handleClearMetadata}
            onAddCustomField={handleAddCustomField}
            onUpdateCustomField={handleAddCustomField}
            onRemoveCustomField={handleRemoveCustomField}
          />
        ) : null
      ) : (
        <EmptyState
          icon={<MetadataIcon />}
          title="查看和编辑 PDF 元数据"
          description="拖拽 PDF 文件到这里，或点击左侧“添加文件”开始"
        />
      )}
    </div>
  );
}

