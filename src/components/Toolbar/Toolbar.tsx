import "./Toolbar.css";

interface ToolbarProps {
  onAddFiles: () => void;
  onAddFolder: () => void;
  onClearList: () => void;
  hasFiles: boolean;
}

export function Toolbar({
  onAddFiles,
  onAddFolder,
  onClearList,
  hasFiles,
}: ToolbarProps) {
  return (
    <header className="toolbar" data-tauri-drag-region>
      <div className="toolbar__title">PDF Metadata Editor</div>
      <div className="toolbar__actions">
        <button className="toolbar__btn toolbar__btn--primary" onClick={onAddFiles}>
          添加文件
        </button>
        <button className="toolbar__btn" onClick={onAddFolder}>
          添加目录
        </button>
        <button
          className="toolbar__btn toolbar__btn--danger"
          onClick={onClearList}
          disabled={!hasFiles}
        >
          清空列表
        </button>
      </div>
    </header>
  );
}
