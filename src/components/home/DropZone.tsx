import { open } from "@tauri-apps/plugin-dialog";
import { useFileDrop } from "../../services/fileDropService";
import "./DropZone.css";

interface Props {
  onFiles: (paths: string[]) => void;
}

export function DropZone({ onFiles }: Props) {
  const { isOver } = useFileDrop(["pdf", "docx"], onFiles);

  async function pickFiles() {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF / DOCX", extensions: ["pdf", "docx"] }],
    });
    if (!selected) return;
    onFiles(Array.isArray(selected) ? selected : [selected]);
  }

  return (
    <div className={`drop-zone${isOver ? " drop-zone--over" : ""}`}>
      <div className="drop-zone__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M12 4v11" strokeLinecap="round" />
          <path d="M7.5 10.5 12 15l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 19.5h14" strokeLinecap="round" />
        </svg>
      </div>
      <div className="drop-zone__title">拖拽文件到这里</div>
      <div className="drop-zone__subtitle">支持 PDF、DOCX 文件</div>
      <button type="button" className="drop-zone__button" onClick={pickFiles}>
        选择文件
      </button>
    </div>
  );
}
