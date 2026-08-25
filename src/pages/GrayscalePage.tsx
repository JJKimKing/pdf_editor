import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { FilePanel } from "../components/metadata/FilePanel";
import { EmptyState } from "../components/shell/EmptyState";
import { GrayscaleIcon } from "../components/shell/icons";
import { useFileDrop } from "../services/fileDropService";
import { dialogStore } from "../stores/dialogStore";
import { grayscaleStore, useGrayscaleState } from "../stores/grayscaleStore";
import type { GrayscaleOutcome } from "../types/pdf";
import { formatFileSize } from "../utils/format";
import "./GrayscalePage.css";

interface Props {
  onStatusChange: (context: string | undefined) => void;
}

export function GrayscalePage({ onStatusChange }: Props) {
  const { files, activeId, selectedIds, converting, lastOutcome } = useGrayscaleState();

  const activeFile = files.find((f) => f.id === activeId) ?? null;
  const isBatchMode = selectedIds.size >= 2;
  const activeOutcome = activeId && lastOutcome?.fileId === activeId ? lastOutcome.outcome : null;

  useEffect(() => {
    onStatusChange(
      `共 ${files.length} 个文件${selectedIds.size > 0 ? ` · 已选中 ${selectedIds.size} 个` : ""}`,
    );
    return () => onStatusChange(undefined);
  }, [files.length, selectedIds.size, onStatusChange]);

  const { isOver } = useFileDrop(["pdf"], (paths) => grayscaleStore.addFiles(paths));

  async function handleAddFiles() {
    const selected = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!selected) return;
    void grayscaleStore.addFiles(Array.isArray(selected) ? selected : [selected]);
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
    void grayscaleStore.addFolder(selected, choice === "recursive");
  }

  function handleSelect(id: string, event: React.MouseEvent) {
    grayscaleStore.select(id, event.metaKey || event.ctrlKey);
  }

  return (
    <div className={`grayscale-page${isOver ? " grayscale-page--drop-over" : ""}`}>
      <FilePanel
        files={files}
        activeId={activeId}
        selectedIds={selectedIds}
        dirtyIds={new Set()}
        onSelect={handleSelect}
        onToggleSelect={(id) => grayscaleStore.toggleSelect(id)}
        onRemove={(id) => grayscaleStore.removeFile(id)}
        onAddFiles={handleAddFiles}
        onAddFolder={handleAddFolder}
      />

      {isBatchMode ? (
        <section className="grayscale-panel">
          <h3 className="grayscale-panel__title">已选中 {selectedIds.size} 个文件</h3>
          <p className="grayscale-panel__caption">生成灰度版本，原文件不受影响。</p>
          <button
            type="button"
            className="grayscale-panel__action"
            disabled={converting}
            onClick={() => grayscaleStore.convertBatch([...selectedIds])}
          >
            {converting ? "处理中…" : "批量生成灰度版本"}
          </button>
        </section>
      ) : activeFile ? (
        <section className="grayscale-panel">
          <h3 className="grayscale-panel__title">{activeFile.fileName}</h3>
          <p className="grayscale-panel__meta">
            {formatFileSize(activeFile.fileSize)} · {activeFile.pageCount} 页
          </p>

          {activeOutcome ? (
            <GrayscaleResultCard
              outcome={activeOutcome}
              converting={converting}
              onConvertAgain={() => grayscaleStore.convertOne()}
            />
          ) : (
            <>
              <p className="grayscale-panel__caption">生成灰度版本，原文件不受影响。</p>
              <button
                type="button"
                className="grayscale-panel__action"
                disabled={converting}
                onClick={() => grayscaleStore.convertOne()}
              >
                {converting ? "处理中…" : "生成灰度版本"}
              </button>
            </>
          )}
        </section>
      ) : (
        <EmptyState
          icon={<GrayscaleIcon />}
          title="PDF 图片一键灰度化"
          description="拖拽 PDF 文件到这里，或点击左侧“添加文件”开始"
        />
      )}
    </div>
  );
}

function GrayscaleResultCard({
  outcome,
  converting,
  onConvertAgain,
}: {
  outcome: GrayscaleOutcome;
  converting: boolean;
  onConvertAgain: () => void;
}) {
  const { result, outputFile } = outcome;

  if (!outputFile) {
    return (
      <div className="grayscale-result">
        <p className="grayscale-result__message">未发现可转换的彩色图片，没有生成新文件。</p>
        <button type="button" className="grayscale-panel__action" disabled={converting} onClick={onConvertAgain}>
          {converting ? "处理中…" : "重新检查"}
        </button>
      </div>
    );
  }

  return (
    <div className="grayscale-result grayscale-result--done">
      <div className="grayscale-result__name">已生成 “{outputFile.fileName}”</div>
      <div className="grayscale-result__meta">
        {result.imagesConverted} 张图片转为灰度（跳过 {result.imagesSkipped} 张）· {formatFileSize(result.originalSize)} →{" "}
        {formatFileSize(result.newSize)}
      </div>
      <div className="grayscale-result__actions">
        <button type="button" onClick={() => openPath(outputFile.filePath)}>
          打开
        </button>
        <button type="button" onClick={() => revealItemInDir(outputFile.filePath)}>
          在文件夹中显示
        </button>
        <button type="button" disabled={converting} onClick={onConvertAgain}>
          {converting ? "处理中…" : "再次生成"}
        </button>
      </div>
    </div>
  );
}
