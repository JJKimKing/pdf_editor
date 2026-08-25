/**
 * Central nav/route registry. Adding a future tool (merge, split, compress,
 * …) is a one-line append here plus a page component — the sidebar and the
 * view switch in App.tsx never need to change shape (see product spec §4).
 */
export type ViewId =
  | "home"
  | "pdf-to-docx"
  | "docx-to-pdf"
  | "metadata"
  | "history"
  | "settings";

export interface NavItem {
  id: ViewId;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "首页" },
  { id: "pdf-to-docx", label: "PDF 转 DOCX" },
  { id: "docx-to-pdf", label: "DOCX 转 PDF" },
  { id: "metadata", label: "PDF 元数据编辑" },
  { id: "history", label: "历史记录" },
];

export const SETTINGS_ITEM: NavItem = { id: "settings", label: "设置" };
