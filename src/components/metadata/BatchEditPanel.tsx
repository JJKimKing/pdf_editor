import { useState } from "react";
import type { MetadataPatch } from "../../types/pdf";
import "./BatchEditPanel.css";

interface Props {
  count: number;
  onApply: (patch: MetadataPatch) => void | Promise<void>;
  onClearAll: () => void | Promise<void>;
}

const FIELDS: { key: keyof MetadataPatch; label: string }[] = [
  { key: "title", label: "标题 Title" },
  { key: "author", label: "作者 Author" },
  { key: "subject", label: "主题 Subject" },
  { key: "keywords", label: "关键词 Keywords" },
  { key: "creator", label: "Creator" },
];

interface RowState {
  enabled: boolean;
  value: string;
}

/**
 * Batch metadata edit with real patch semantics (product spec §26): a field
 * only ends up in the outgoing patch when its checkbox is enabled — a blank
 * input never silently clears a field. Explicit "清空" writes `""`.
 */
export function BatchEditPanel({ count, onApply, onClearAll }: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, { enabled: false, value: "" }])),
  );
  const [applying, setApplying] = useState(false);

  function setRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const hasChanges = Object.values(rows).some((r) => r.enabled);

  async function handleApply() {
    const patch: MetadataPatch = {};
    for (const f of FIELDS) {
      if (rows[f.key].enabled) patch[f.key] = rows[f.key].value;
    }
    setApplying(true);
    try {
      await onApply(patch);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="batch-edit">
      <section className="metadata-panel">
        <h3 className="metadata-panel__title">批量编辑 · 已选中 {count} 个文件</h3>
        <p className="metadata-panel__hint">勾选要修改的字段；未勾选的字段保持每个文件原有值不变。</p>

        {FIELDS.map((f) => (
          <div className="batch-edit__row" key={f.key}>
            <label className="batch-edit__checkbox">
              <input
                type="checkbox"
                checked={rows[f.key].enabled}
                onChange={(e) => setRow(f.key, { enabled: e.target.checked })}
              />
              {f.label}
            </label>
            <input
              className="batch-edit__input"
              value={rows[f.key].value}
              disabled={!rows[f.key].enabled}
              placeholder="统一设置为…"
              onChange={(e) => setRow(f.key, { value: e.target.value })}
            />
            <button
              type="button"
              className="batch-edit__clear-btn"
              disabled={!rows[f.key].enabled}
              onClick={() => setRow(f.key, { value: "" })}
            >
              清空该字段
            </button>
          </div>
        ))}

        <button
          type="button"
          className="batch-edit__apply"
          disabled={!hasChanges || applying}
          onClick={handleApply}
        >
          {applying ? "应用中…" : "应用到所选文件"}
        </button>
      </section>

      <section className="metadata-panel">
        <h3 className="metadata-panel__title">批量清除</h3>
        <p className="metadata-panel__hint">
          清空所选 {count} 个文件的 Title / Author / Subject / Keywords / Creator / Producer，保留页面内容。
        </p>
        <button type="button" className="batch-edit__clear-all" onClick={onClearAll}>
          清除所选文件的元数据
        </button>
      </section>
    </div>
  );
}
