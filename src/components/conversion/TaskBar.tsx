import { open } from "@tauri-apps/plugin-dialog";
import { FolderIcon } from "../shell/icons";
import "./TaskBar.css";

interface Props {
  outputDir: string;
  onChangeOutputDir: (dir: string) => void;
  openAfter: boolean;
  onChangeOpenAfter: (v: boolean) => void;
  onStart: () => void;
  onCancelAll: () => void;
  canStart: boolean;
  hasActive: boolean;
}

export function TaskBar({
  outputDir,
  onChangeOutputDir,
  openAfter,
  onChangeOpenAfter,
  onStart,
  onCancelAll,
  canStart,
  hasActive,
}: Props) {
  async function pickDir() {
    const selected = await open({ directory: true });
    if (typeof selected === "string") onChangeOutputDir(selected);
  }

  return (
    <div className="task-bar">
      <div className="task-bar__left">
        <div className="task-bar__output">
          <span className="task-bar__label">输出目录</span>
          <span className="task-bar__path" title={outputDir}>
            {outputDir || "未选择，默认与源文件同目录"}
          </span>
          <button type="button" className="task-bar__pick" onClick={pickDir}>
            <FolderIcon />
            选择
          </button>
        </div>
        <label className="task-bar__checkbox">
          <input type="checkbox" checked={openAfter} onChange={(e) => onChangeOpenAfter(e.target.checked)} />
          转换完成后打开文件夹
        </label>
      </div>
      <div className="task-bar__right">
        {hasActive && (
          <button type="button" className="task-bar__button" onClick={onCancelAll}>
            取消任务
          </button>
        )}
        <button
          type="button"
          className="task-bar__button task-bar__button--primary"
          disabled={!canStart}
          onClick={onStart}
        >
          开始转换
        </button>
      </div>
    </div>
  );
}
