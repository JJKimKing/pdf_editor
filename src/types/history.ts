/** Mirrors src-tauri/src/history/mod.rs::HistoryEntry — keep both in sync. */

export type HistoryOperation = "pdf_to_docx" | "docx_to_pdf" | "metadata_write" | "grayscale_images";
export type HistoryStatus = "success" | "failed" | "cancelled";

export interface HistoryEntry {
  id: string;
  sourcePath: string;
  sourceName: string;
  operation: HistoryOperation;
  outputPath: string | null;
  status: HistoryStatus;
  error: string | null;
  fileSize: number;
  createdAt: string;
}

export const OPERATION_LABEL: Record<HistoryOperation, string> = {
  pdf_to_docx: "PDF → DOCX",
  docx_to_pdf: "DOCX → PDF",
  metadata_write: "元数据编辑",
  grayscale_images: "图片灰度化",
};

export const HISTORY_STATUS_LABEL: Record<HistoryStatus, string> = {
  success: "成功",
  failed: "失败",
  cancelled: "已取消",
};
