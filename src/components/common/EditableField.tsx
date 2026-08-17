import { useEffect, useRef, useState } from "react";
import "./EditableField.css";

interface EditableFieldProps {
  label: string;
  value: string | null;
  onSave: (value: string) => void | Promise<void>;
  /** Shows a trailing 🗑 button and calls this instead of rendering a pencil icon. */
  onRemove?: () => void | Promise<void>;
  placeholder?: string;
}

export function EditableField({
  label,
  value,
  onSave,
  onRemove,
  placeholder = "未设置",
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  async function commit() {
    if (draft === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // Failure is already surfaced via the app-level error banner; keep
      // the field open with the user's draft so they don't lose it.
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  async function handleRemove() {
    if (!onRemove) return;
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="editable-row">
      <div className="editable-row__label" title={label}>
        {label}
      </div>

      {editing ? (
        <>
          <input
            ref={inputRef}
            className="editable-row__input"
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={(e) => {
              // Ignore Enter while an IME (e.g. Chinese pinyin) is still
              // resolving a candidate — that Enter confirms the candidate,
              // it isn't the user asking to save the field yet.
              if (e.key === "Enter" && !composingRef.current && !e.nativeEvent.isComposing) {
                commit();
              }
              if (e.key === "Escape") cancel();
            }}
          />
          <button
            type="button"
            className="editable-row__icon-btn editable-row__icon-btn--save"
            title="保存"
            disabled={saving}
            onClick={commit}
          >
            {saving ? "…" : "✓"}
          </button>
          <button
            type="button"
            className="editable-row__icon-btn"
            title="取消"
            disabled={saving}
            onClick={cancel}
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="editable-row__box"
            title="点击编辑"
            onClick={() => setEditing(true)}
          >
            {value ? (
              <span className="editable-row__text">{value}</span>
            ) : (
              <span className="editable-row__placeholder">{placeholder}</span>
            )}
          </button>
          <button
            type="button"
            className="editable-row__icon-btn"
            title="编辑"
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
          {onRemove && (
            <button
              type="button"
              className="editable-row__icon-btn editable-row__icon-btn--danger"
              title="删除该字段"
              disabled={removing}
              onClick={handleRemove}
            >
              {removing ? "…" : "🗑"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
