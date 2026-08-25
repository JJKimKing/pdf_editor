import type { ReactElement } from "react";
import { NAV_ITEMS, SETTINGS_ITEM, type ViewId } from "../../app/routes";
import {
  DocxToPdfIcon,
  HistoryIcon,
  HomeIcon,
  MetadataIcon,
  PdfToDocxIcon,
  SettingsIcon,
} from "./icons";
import "./Sidebar.css";

const ICONS: Record<ViewId, (props: { className?: string }) => ReactElement> = {
  home: HomeIcon,
  "pdf-to-docx": PdfToDocxIcon,
  "docx-to-pdf": DocxToPdfIcon,
  metadata: MetadataIcon,
  history: HistoryIcon,
  settings: SettingsIcon,
};

interface Props {
  active: ViewId;
  onNavigate: (id: ViewId) => void;
  activeTaskCount: number;
}

export function Sidebar({ active, onNavigate, activeTaskCount }: Props) {
  const busy = activeTaskCount > 0;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">P</span>
        <span className="sidebar__title">PDF Toolkit</span>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const ItemIcon = ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar__item${active === item.id ? " sidebar__item--active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <ItemIcon className="sidebar__item-icon" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__spacer" />

      <div className="sidebar__footer">
        <button
          type="button"
          className={`sidebar__item${active === SETTINGS_ITEM.id ? " sidebar__item--active" : ""}`}
          onClick={() => onNavigate(SETTINGS_ITEM.id)}
        >
          <SettingsIcon className="sidebar__item-icon" />
          {SETTINGS_ITEM.label}
        </button>
        <div className="sidebar__status">
          <span
            className={`sidebar__status-dot${busy ? " sidebar__status-dot--busy" : " sidebar__status-dot--ready"}`}
          />
          <span className="sidebar__status-text">
            {busy ? `正在处理 ${activeTaskCount} 个文件` : "就绪"}
          </span>
        </div>
      </div>
    </aside>
  );
}
