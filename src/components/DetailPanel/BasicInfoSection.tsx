import type { PdfBasicInfo } from "../../types/pdf";
import { formatDate, formatFileSize } from "../../utils/format";

interface BasicInfoSectionProps {
  file: PdfBasicInfo;
}

export function BasicInfoSection({ file }: BasicInfoSectionProps) {
  const rows: [string, string][] = [
    ["文件名称", file.fileName],
    ["文件路径", file.filePath],
    ["文件大小", formatFileSize(file.fileSize)],
    ["PDF 版本", file.pdfVersion],
    ["页数", `${file.pageCount} 页`],
    ["创建时间", formatDate(file.createdAt)],
    ["修改时间", formatDate(file.modifiedAt)],
  ];

  return (
    <section className="card">
      <h3 className="card__title">基础信息</h3>
      <dl className="info-grid">
        {rows.map(([label, value]) => (
          <div className="info-grid__row" key={label}>
            <dt>{label}</dt>
            <dd title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
