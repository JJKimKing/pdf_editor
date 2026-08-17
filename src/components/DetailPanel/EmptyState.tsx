import "./DetailPanel.css";

export function EmptyState() {
  return (
    <div className="detail-panel detail-panel--empty">
      <div className="empty-state">
        <div className="empty-state__icon">📄</div>
        <p>选择左侧的 PDF 文件以查看和编辑属性</p>
      </div>
    </div>
  );
}
