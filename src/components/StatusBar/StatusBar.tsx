import "./StatusBar.css";

interface StatusBarProps {
  fileCount: number;
  selectedCount: number;
  version: string;
}

export function StatusBar({ fileCount, selectedCount, version }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span>共 {fileCount} 个文件</span>
      {selectedCount > 0 && <span>已选中 {selectedCount} 个</span>}
      <span className="status-bar__spacer" />
      <span>v{version}</span>
    </footer>
  );
}
