import { useState } from "react";
import type { CustomField } from "../../types/pdf";
import { EditableField } from "../common/EditableField";

interface CustomFieldsSectionProps {
  fields: CustomField[];
  onAdd: (key: string, value: string) => void | Promise<void>;
  onUpdate: (key: string, value: string) => void | Promise<void>;
  onRemove: (key: string) => void | Promise<void>;
}

export function CustomFieldsSection({
  fields,
  onAdd,
  onUpdate,
  onRemove,
}: CustomFieldsSectionProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const key = newKey.trim();
    if (!key) return;
    setAdding(true);
    try {
      await onAdd(key, newValue);
      setNewKey("");
      setNewValue("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="card">
      <h3 className="card__title">自定义元数据</h3>
      <p className="card__hint">
        字段名可以自己取，不限于标准的标题/作者/主题/关键字。
      </p>

      <div className="field-list field-list--wide">
        {fields.map((field) => (
          <EditableField
            key={field.key}
            label={field.key}
            value={field.value}
            onSave={(value) => onUpdate(field.key, value)}
            onRemove={() => onRemove(field.key)}
          />
        ))}
      </div>

      <div className="custom-field-add-row">
        <input
          className="custom-field-add-row__key-input"
          placeholder="字段名"
          value={newKey}
          disabled={adding}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <input
          className="custom-field-add-row__value-input"
          placeholder="字段值"
          value={newValue}
          disabled={adding}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd();
          }}
        />
        <button
          type="button"
          className="editable-row__icon-btn editable-row__icon-btn--save"
          title="添加字段"
          disabled={adding || !newKey.trim()}
          onClick={handleAdd}
        >
          {adding ? "…" : "＋"}
        </button>
      </div>
    </section>
  );
}
