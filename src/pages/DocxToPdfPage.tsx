import { DocxToPdfIcon } from "../components/shell/icons";
import { ConversionWorkspacePage } from "./ConversionWorkspacePage";

export function DocxToPdfPage() {
  return (
    <ConversionWorkspacePage
      taskType="docx_to_pdf"
      viewId="docx-to-pdf"
      title="DOCX 转 PDF"
      subtitle="将 Word 文档转换为 PDF 文件"
      icon={<DocxToPdfIcon />}
      emptyTitle="将 Word 转换为 PDF"
      emptyDescription="拖拽 DOCX 文件到这里，或点击下方按钮选择文件"
    />
  );
}
