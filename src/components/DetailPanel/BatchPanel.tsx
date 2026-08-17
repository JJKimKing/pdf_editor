import { useState } from "react";
import type { MetadataPatch } from "../../types/pdf";
import "./DetailPanel.css";

interface BatchPanelProps {
  count: number;
  onBatchUpdate: (patch: MetadataPatch) => void | Promise<void>;
  onBatchClear: () => void | Promise<void>;
}

const FIELD_OPTIONS: { value: keyof MetadataPatch; label: string }[] = [
  { value: "author", label: "作者 Author" },
  { value: "title", label: "标题 Title" },
  { value: "subject", label: "主题 Subject" },
  { value: "keywords", label: "关键词 Keywords" },
];

export function BatchPanel({ count, onBatchUpdate, onBatchClear }: BatchPanelProps) {
  const [field, setField] = useState<keyof MetadataPatch>("author");
  const [value, setValue] = useState("");

  return (
    <div className="detail-panel">
      <div className="detail-panel__content">
        <section className="card">
          <h3 className="card__title">批量处理 · 已选中 {count} 个文件</h3>

          <div className="batch-row">
            <select
              className="batch-select"
              value={field}
              onChange={(e) => setField(e.target.value as keyof MetadataPatch)}
            >
              {FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              className="batch-input"
              placeholder="统一设置为…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              className="toolbar__btn toolbar__btn--primary"
              disabled={!value}
              onClick={() => onBatchUpdate({ [field]: value })}
            >
              应用到所选文件
            </button>
          </div>
        </section>

        <section className="card">
          <h3 className="card__title">批量清除</h3>
          <p className="card__hint">
            清空所选 {count} 个文件的 Title / Author / Subject / Keywords /
            Creator / Producer，保留页面内容。
          </p>
          <button className="toolbar__btn toolbar__btn--danger" onClick={onBatchClear}>
            清除所选文件的元数据
          </button>
        </section>
      </div>
    </div>
  );
}
