import { useState } from "react";
import "./TagInput.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const SPLIT_RE = /[,，、;；]+/;

function toTags(value: string): string[] {
  return value
    .split(SPLIT_RE)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Keywords are stored as one PDF /Keywords string, but edited as chips
 * (product spec §21). `onChange` always receives the joined string the
 * backend expects — the chip UI is purely presentational.
 */
export function TagInput({ value, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const tags = toTags(value);

  function commitDraft() {
    const next = draft.trim();
    if (!next) return;
    onChange([...tags, next].join(", "));
    setDraft("");
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index).join(", "));
  }

  return (
    <div className="tag-input">
      {tags.map((tag, i) => (
        <span className="tag-input__chip" key={`${tag}-${i}`}>
          {tag}
          <button type="button" className="tag-input__chip-remove" onClick={() => removeTag(i)}>
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-input__field"
        value={draft}
        placeholder={tags.length === 0 ? "输入关键词，回车添加" : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
            removeTag(tags.length - 1);
          }
        }}
        onBlur={commitDraft}
      />
    </div>
  );
}
