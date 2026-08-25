import "./StatusBar.css";

interface Props {
  /** Page-provided context, e.g. "共 12 个文件 · 已选中 2 个". */
  context?: string;
  version: string;
}

export function StatusBar({ context, version }: Props) {
  return (
    <footer className="status-bar">
      {context && <span>{context}</span>}
      <span className="status-bar__spacer" />
      <span>v{version}</span>
    </footer>
  );
}
