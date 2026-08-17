import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { pdfApi } from "./api/pdf";
import { BatchPanel } from "./components/DetailPanel/BatchPanel";
import { DetailPanel } from "./components/DetailPanel/DetailPanel";
import { EmptyState } from "./components/DetailPanel/EmptyState";
import { FileList } from "./components/FileList/FileList";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { Toolbar } from "./components/Toolbar/Toolbar";
import "./styles/theme.css";
import type { MetadataPatch, PdfBasicInfo, PdfMetadata } from "./types/pdf";

const APP_VERSION = "0.1.0";

const PDF_FILTER = [{ name: "PDF", extensions: ["pdf"] }];

function App() {
  const [files, setFiles] = useState<PdfBasicInfo[]>([]);
  const [metadataStore, setMetadataStore] = useState<Record<string, PdfMetadata>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeId) ?? null,
    [files, activeId],
  );
  const activeMetadata = activeId ? metadataStore[activeId] ?? null : null;

  useEffect(() => {
    if (!activeId || metadataStore[activeId]) return;
    let cancelled = false;
    setMetadataLoading(true);
    pdfApi
      .getMetadata(activeId)
      .then((meta) => {
        if (!cancelled) setMetadataStore((prev) => ({ ...prev, [activeId]: meta }));
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setMetadataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, metadataStore]);

  function applyFileUpdate(id: string, meta: PdfMetadata) {
    setMetadataStore((prev) => ({ ...prev, [id]: meta }));
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "modified", modifiedAt: meta.modDate ?? f.modifiedAt } : f,
      ),
    );
  }

  async function handleSave(id: string, patch: MetadataPatch) {
    try {
      const meta = await pdfApi.updateMetadata(id, patch);
      applyFileUpdate(id, meta);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }

  async function handleClearMetadata(id: string) {
    try {
      const meta = await pdfApi.clearMetadata(id);
      applyFileUpdate(id, meta);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }

  async function handleAddCustomField(id: string, key: string, value: string) {
    try {
      const meta = await pdfApi.setCustomField(id, key, value);
      applyFileUpdate(id, meta);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }

  async function handleRemoveCustomField(id: string, key: string) {
    try {
      const meta = await pdfApi.removeCustomField(id, key);
      applyFileUpdate(id, meta);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }

  async function handleBatchUpdate(ids: string[], patch: MetadataPatch) {
    try {
      const results = await pdfApi.batchUpdateMetadata(ids, patch);
      const failed = results.filter((r) => !r.success);
      for (const r of results) {
        if (r.success) {
          setFiles((prev) =>
            prev.map((f) => (f.id === r.id ? { ...f, status: "modified" } : f)),
          );
          setMetadataStore((prev) => {
            const current = prev[r.id];
            return current ? { ...prev, [r.id]: { ...current, ...patch } } : prev;
          });
        }
      }
      if (failed.length > 0) {
        setError(`${failed.length} 个文件处理失败：${failed[0].error ?? "未知错误"}`);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleBatchClear(ids: string[]) {
    try {
      const results = await pdfApi.batchClearMetadata(ids);
      const failed = results.filter((r) => !r.success);
      for (const r of results) {
        if (r.success) {
          setFiles((prev) =>
            prev.map((f) => (f.id === r.id ? { ...f, status: "modified" } : f)),
          );
          setMetadataStore((prev) => {
            const current = prev[r.id];
            return current
              ? {
                  ...prev,
                  [r.id]: {
                    ...current,
                    title: null,
                    author: null,
                    subject: null,
                    keywords: null,
                    creator: null,
                    producer: null,
                  },
                }
              : prev;
          });
        }
      }
      if (failed.length > 0) {
        setError(`${failed.length} 个文件处理失败：${failed[0].error ?? "未知错误"}`);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleAddFiles() {
    const selected = await open({ multiple: true, filters: PDF_FILTER });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;
    try {
      const added = await pdfApi.addFiles(paths);
      setFiles((prev) => [...prev, ...added]);
      if (!activeId && added.length > 0) setActiveId(added[0].id);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleAddFolder() {
    const selected = await open({ directory: true });
    if (!selected || Array.isArray(selected)) return;
    try {
      const added = await pdfApi.addFolder(selected);
      setFiles((prev) => [...prev, ...added]);
      if (!activeId && added.length > 0) setActiveId(added[0].id);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleClearList() {
    try {
      await pdfApi.clearFiles();
      setFiles([]);
      setMetadataStore({});
      setActiveId(null);
      setSelectedIds(new Set());
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRemoveFile(id: string) {
    try {
      await pdfApi.removeFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeId === id) setActiveId(null);
    } catch (err) {
      setError(String(err));
    }
  }

  function handleSelect(id: string, event: React.MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
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

  const isBatchMode = selectedIds.size >= 2;

  return (
    <div className="app-shell">
      <Toolbar
        onAddFiles={handleAddFiles}
        onAddFolder={handleAddFolder}
        onClearList={handleClearList}
        hasFiles={files.length > 0}
      />

      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error}
          <span className="error-banner__close">×</span>
        </div>
      )}

      <div className="app-body">
        <FileList
          files={files}
          activeId={activeId}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onToggleSelect={handleToggleSelect}
          onRemove={handleRemoveFile}
        />

        {isBatchMode ? (
          <BatchPanel
            count={selectedIds.size}
            onBatchUpdate={(patch) => handleBatchUpdate([...selectedIds], patch)}
            onBatchClear={() => handleBatchClear([...selectedIds])}
          />
        ) : activeFile ? (
          metadataLoading && !activeMetadata ? (
            <div className="detail-panel-loading">正在读取 PDF 元数据…</div>
          ) : activeMetadata ? (
            <DetailPanel
              file={activeFile}
              metadata={activeMetadata}
              onSave={(patch) => handleSave(activeFile.id, patch)}
              onClearMetadata={() => handleClearMetadata(activeFile.id)}
              onAddCustomField={(key, value) => handleAddCustomField(activeFile.id, key, value)}
              onRemoveCustomField={(key) => handleRemoveCustomField(activeFile.id, key)}
            />
          ) : null
        ) : (
          <EmptyState />
        )}
      </div>

      <StatusBar
        fileCount={files.length}
        selectedCount={selectedIds.size}
        version={APP_VERSION}
      />
    </div>
  );
}

export default App;
