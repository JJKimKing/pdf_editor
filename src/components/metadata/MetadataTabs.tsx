import { useState } from "react";
import type { CustomField, PdfBasicInfo, PdfMetadata } from "../../types/pdf";
import { formatDate, formatFileSize } from "../../utils/format";
import { CustomFieldRow, FieldRow, ReadOnlyRow } from "./FieldRow";
import { TagInput } from "./TagInput";
import "./MetadataTabs.css";

export interface DraftFields {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
}

interface DocumentInfoProps {
  draft: DraftFields;
  onChange: (patch: Partial<DraftFields>) => void;
  custom: CustomField[];
  onAddCustomField: (key: string, value: string) => void | Promise<void>;
  onUpdateCustomField: (key: string, value: string) => void | Promise<void>;
  onRemoveCustomField: (key: string) => void | Promise<void>;
}

export function DocumentInfoTab({
  draft,
  onChange,
  custom,
  onAddCustomField,
  onUpdateCustomField,
  onRemoveCustomField,
}: DocumentInfoProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const key = newKey.trim();
    if (!key) return;
    setAdding(true);
    try {
      await onAddCustomField(key, newValue);
      setNewKey("");
      setNewValue("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="metadata-tab">
      <section className="metadata-panel">
        <h3 className="metadata-panel__title">文档信息</h3>
        <FieldRow label="标题" value={draft.title} onChange={(title) => onChange({ title })} />
        <FieldRow label="作者" value={draft.author} onChange={(author) => onChange({ author })} />
        <FieldRow label="主题" value={draft.subject} onChange={(subject) => onChange({ subject })} />
        <div className="field-row">
          <label className="field-row__label">关键词</label>
          <TagInput value={draft.keywords} onChange={(keywords) => onChange({ keywords })} />
        </div>
        <FieldRow label="Creator" value={draft.creator} onChange={(creator) => onChange({ creator })} />
      </section>

      <section className="metadata-panel">
        <h3 className="metadata-panel__title">自定义字段</h3>
        <p className="metadata-panel__hint">
          字段名不限于标准字段，立即生效（不受"保存更改"控制）。已正确写入 PDF 文件，但部分阅读器（如
          WPS）的属性面板不提供自定义字段的展示入口，可能看不到——这是阅读器的限制，不代表数据没保存成功。
        </p>
        {custom.map((field) => (
          <div className="custom-field-row" key={field.key}>
            <CustomFieldRow
              label={field.key}
              value={field.value}
              onChange={(value) => onUpdateCustomField(field.key, value)}
            />
            <button type="button" className="custom-field-row__remove" onClick={() => onRemoveCustomField(field.key)}>
              删除
            </button>
          </div>
        ))}
        <div className="custom-field-add">
          <input
            className="custom-field-add__key"
            placeholder="字段名"
            value={newKey}
            disabled={adding}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <input
            className="custom-field-add__value"
            placeholder="字段值"
            value={newValue}
            disabled={adding}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd();
            }}
          />
          <button type="button" className="custom-field-add__button" disabled={adding || !newKey.trim()} onClick={handleAdd}>
            添加
          </button>
        </div>
      </section>
    </div>
  );
}

export function PdfInfoTab({ file, metadata }: { file: PdfBasicInfo; metadata: PdfMetadata }) {
  return (
    <div className="metadata-tab">
      <section className="metadata-panel">
        <h3 className="metadata-panel__title">PDF 信息</h3>
        <ReadOnlyRow label="PDF 版本" value={file.pdfVersion} />
        <ReadOnlyRow label="页数" value={`${file.pageCount} 页`} />
        <ReadOnlyRow label="文件大小" value={formatFileSize(file.fileSize)} />
        <ReadOnlyRow label="Producer" value={metadata.producer || "—"} />
        <ReadOnlyRow label="Creator" value={metadata.creator || "—"} />
        <ReadOnlyRow label="已加密" value={file.encrypted ? "是" : "否"} />
      </section>
    </div>
  );
}

export function DateInfoTab({ metadata }: { metadata: PdfMetadata }) {
  return (
    <div className="metadata-tab">
      <section className="metadata-panel">
        <h3 className="metadata-panel__title">日期信息</h3>
        <ReadOnlyRow label="创建时间" value={formatDate(metadata.creationDate)} />
        <ReadOnlyRow label="修改时间" value={formatDate(metadata.modDate)} />
      </section>
    </div>
  );
}
