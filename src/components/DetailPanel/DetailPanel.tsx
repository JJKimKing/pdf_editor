import { useState } from "react";
import type { MetadataPatch, PdfBasicInfo, PdfMetadata } from "../../types/pdf";
import { AdvancedInfoTable } from "./AdvancedInfoTable";
import { BasicInfoSection } from "./BasicInfoSection";
import "./DetailPanel.css";
import { MetadataFields } from "./MetadataFields";

type Mode = "basic" | "advanced";

interface DetailPanelProps {
  file: PdfBasicInfo;
  metadata: PdfMetadata;
  onSave: (patch: MetadataPatch) => void | Promise<void>;
  onClearMetadata: () => void | Promise<void>;
  onAddCustomField: (key: string, value: string) => void | Promise<void>;
  onRemoveCustomField: (key: string) => void | Promise<void>;
}

export function DetailPanel({
  file,
  metadata,
  onSave,
  onClearMetadata,
  onAddCustomField,
  onRemoveCustomField,
}: DetailPanelProps) {
  const [mode, setMode] = useState<Mode>("basic");

  return (
    <div className="detail-panel">
      <div className="detail-panel__tabs">
        <button
          className={`detail-panel__tab${mode === "basic" ? " detail-panel__tab--active" : ""}`}
          onClick={() => setMode("basic")}
        >
          常用元数据编辑
        </button>
        <button
          className={`detail-panel__tab${mode === "advanced" ? " detail-panel__tab--active" : ""}`}
          onClick={() => setMode("advanced")}
        >
          查看更多
        </button>
        <button className="detail-panel__clear-btn" onClick={onClearMetadata}>
          清空元数据
        </button>
      </div>

      <div className="detail-panel__content">
        <BasicInfoSection file={file} />
        {mode === "basic" ? (
          <MetadataFields metadata={metadata} onSave={onSave} />
        ) : (
          <AdvancedInfoTable
            metadata={metadata}
            onSave={onSave}
            onAddCustomField={onAddCustomField}
            onRemoveCustomField={onRemoveCustomField}
          />
        )}
      </div>
    </div>
  );
}
