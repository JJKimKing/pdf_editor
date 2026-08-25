import { PdfToDocxIcon } from "../components/shell/icons";
import { ConversionWorkspacePage } from "./ConversionWorkspacePage";

export function PdfToDocxPage() {
  return (
    <ConversionWorkspacePage
      taskType="pdf_to_docx"
      viewId="pdf-to-docx"
      title="PDF 转 DOCX"
      subtitle="将 PDF 文档转换为可编辑的 Word 文档"
      icon={<PdfToDocxIcon />}
      emptyTitle="将 PDF 转换为 Word"
      emptyDescription="拖拽 PDF 文件到这里，或点击下方按钮选择文件"
    />
  );
}
