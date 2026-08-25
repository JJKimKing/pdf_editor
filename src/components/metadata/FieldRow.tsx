import type { ReactNode } from "react";
import "./FieldRow.css";

interface EditableProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

/** Plain controlled field — the parent workspace owns the draft + dirty state (product spec §24). */
export function FieldRow({ label, value, placeholder = "未设置", onChange, multiline }: EditableProps) {
  return (
    <div className="field-row">
      <label className="field-row__label">{label}</label>
      {multiline ? (
        <textarea
          className="field-row__input field-row__input--multiline"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="field-row__input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function CustomFieldRow({ label, value, onChange }: EditableProps) {
  return <FieldRow label={label} value={value} onChange={onChange} />;
}

interface ReadOnlyProps {
  label: string;
  value: ReactNode;
}

/** Property-panel style read-only row (product spec §22 — not a disabled input). */
export function ReadOnlyRow({ label, value }: ReadOnlyProps) {
  return (
    <div className="field-row field-row--readonly">
      <span className="field-row__label">{label}</span>
      <span className="field-row__value">{value}</span>
    </div>
  );
}
