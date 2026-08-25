import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { contextMenuStore } from "../../stores/contextMenuStore";
import { useShortcut } from "../../hooks/useShortcut";
import type { PdfBasicInfo, PdfMetadata } from "../../types/pdf";
import { formatFileSize } from "../../utils/format";
import { DateInfoTab, DocumentInfoTab, PdfInfoTab, type DraftFields } from "./MetadataTabs";
import "./Workspace.css";

type Tab = "document" | "pdf" | "date";

interface Props {
  file: PdfBasicInfo;
  metadata: PdfMetadata;
  draft: DraftFields;
  dirty: boolean;
  saving: boolean;
  onDraftChange: (patch: Partial<DraftFields>) => void;
  onSave: () => void | Promise<void>;
  onReload: () => void | Promise<void>;
  onClearMetadata: () => void | Promise<void>;
  onAddCustomField: (key: string, value: string) => void | Promise<void>;
  onUpdateCustomField: (key: string, value: string) => void | Promise<void>;
  onRemoveCustomField: (key: string) => void | Promise<void>;
}

export function Workspace({
  file,
  metadata,
  draft,
  dirty,
  saving,
  onDraftChange,
  onSave,
  onReload,
  onClearMetadata,
  onAddCustomField,
  onUpdateCustomField,
  onRemoveCustomField,
}: Props) {
  const [tab, setTab] = useState<Tab>("document");

  useShortcut("s", () => {
    if (dirty && !saving) void onSave();
  });

  return (
    <div className="metadata-workspace">
      <div className="metadata-workspace__header">
        <div className="metadata-workspace__title-block">
          <div className="metadata-workspace__filename">{file.fileName}</div>
          <div className="metadata-workspace__submeta">
            {formatFileSize(file.fileSize)} · {file.pageCount} 页 · PDF {file.pdfVersion}
          </div>
        </div>
        <div className="metadata-workspace__actions">
          <button
            type="button"
            className="metadata-workspace__save"
            disabled={!dirty || saving}
            onClick={() => void onSave()}
          >
            {saving ? "保存中…" : "保存更改"}
          </button>
          <button
            type="button"
            className="metadata-workspace__more"
            onClick={(e) =>
              contextMenuStore.open(e, [
                { label: "重新加载", onSelect: () => onReload() },
                { label: "在文件夹中显示", onSelect: () => revealItemInDir(file.filePath) },
                { label: "清空元数据", onSelect: () => onClearMetadata(), danger: true },
              ])
            }
          >
            更多 ···
          </button>
        </div>
      </div>

      <div className="metadata-workspace__tabs">
        {(
          [
            ["document", "文档信息"],
            ["pdf", "PDF 信息"],
            ["date", "日期信息"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`metadata-workspace__tab${tab === id ? " metadata-workspace__tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "document" && (
        <DocumentInfoTab
          draft={draft}
          onChange={onDraftChange}
          custom={metadata.custom}
          onAddCustomField={onAddCustomField}
          onUpdateCustomField={onUpdateCustomField}
          onRemoveCustomField={onRemoveCustomField}
        />
      )}
      {tab === "pdf" && <PdfInfoTab file={file} metadata={metadata} />}
      {tab === "date" && <DateInfoTab metadata={metadata} />}
    </div>
  );
}
