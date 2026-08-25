import { open } from "@tauri-apps/plugin-dialog";
import type { ViewId } from "../app/routes";
import { DropZone } from "../components/home/DropZone";
import { FeatureCard } from "../components/home/FeatureCard";
import { RecentFiles } from "../components/home/RecentFiles";
import { BatchIcon, DocxToPdfIcon, HistoryIcon, MetadataIcon, PdfToDocxIcon } from "../components/shell/icons";
import { dialogStore } from "../stores/dialogStore";
import { handoffStore } from "../stores/handoffStore";
import { toastStore } from "../stores/toastStore";
import { extOf } from "../utils/format";
import "./HomePage.css";

interface Props {
  onNavigate: (view: ViewId) => void;
}

/** Routes a mixed drop/pick to the right tool, per product spec §8. */
async function routeFiles(paths: string[], onNavigate: (view: ViewId) => void) {
  const pdfs = paths.filter((p) => extOf(p) === "pdf");
  const docxs = paths.filter((p) => extOf(p) === "docx");

  if (pdfs.length > 0 && docxs.length > 0) {
    toastStore.push("warning", "PDF 和 DOCX 文件请分开添加");
    return;
  }
  if (docxs.length > 0) {
    handoffStore.set("docx-to-pdf", docxs);
    onNavigate("docx-to-pdf");
    return;
  }
  if (pdfs.length === 1) {
    const choice = await dialogStore.confirm({
      title: "对这个 PDF 执行",
      actions: [
        { label: "转换为 DOCX", value: "convert", variant: "primary" },
        { label: "编辑元数据", value: "metadata" },
      ],
    });
    if (choice === "convert") {
      handoffStore.set("pdf-to-docx", pdfs);
      onNavigate("pdf-to-docx");
    } else if (choice === "metadata") {
      handoffStore.set("metadata", pdfs);
      onNavigate("metadata");
    }
    return;
  }
  if (pdfs.length > 1) {
    handoffStore.set("pdf-to-docx", pdfs);
    onNavigate("pdf-to-docx");
  }
}

export function HomePage({ onNavigate }: Props) {
  async function pickAndRoute(extensions: string[]) {
    const selected = await open({ multiple: true, filters: [{ name: extensions.join("/"), extensions }] });
    if (!selected) return;
    routeFiles(Array.isArray(selected) ? selected : [selected], onNavigate);
  }

  return (
    <div className="home-page">
      <div className="home-page__header">
        <div>
          <h1 className="home-page__title">首页</h1>
          <p className="home-page__subtitle">快速访问常用 PDF 工具</p>
        </div>
        <div className="home-page__header-actions">
          <button type="button" className="home-page__header-button" onClick={() => pickAndRoute(["pdf", "docx"])}>
            <BatchIcon />
            批量处理
          </button>
          <button type="button" className="home-page__header-button" onClick={() => onNavigate("history")}>
            <HistoryIcon />
            历史记录
          </button>
        </div>
      </div>

      <div className="home-page__body">
        <div className="home-page__main">
          <div className="home-page__cards">
            <FeatureCard
              icon={<PdfToDocxIcon />}
              title="PDF 转 DOCX"
              description="将 PDF 文档转换为可编辑的 Word 文档"
              actionLabel="选择 PDF 文件"
              onAction={async () => {
                const selected = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
                if (!selected) return;
                handoffStore.set("pdf-to-docx", Array.isArray(selected) ? selected : [selected]);
                onNavigate("pdf-to-docx");
              }}
            />
            <FeatureCard
              icon={<DocxToPdfIcon />}
              title="DOCX 转 PDF"
              description="将 Word 文档转换为 PDF 文件"
              actionLabel="选择 DOCX 文件"
              onAction={async () => {
                const selected = await open({ multiple: true, filters: [{ name: "DOCX", extensions: ["docx"] }] });
                if (!selected) return;
                handoffStore.set("docx-to-pdf", Array.isArray(selected) ? selected : [selected]);
                onNavigate("docx-to-pdf");
              }}
            />
            <FeatureCard
              icon={<MetadataIcon />}
              title="PDF 元数据编辑"
              description="查看和修改 PDF 文档属性"
              actionLabel="选择 PDF 文件"
              onAction={async () => {
                const selected = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
                if (!selected) return;
                handoffStore.set("metadata", Array.isArray(selected) ? selected : [selected]);
                onNavigate("metadata");
              }}
            />
          </div>

          <DropZone onFiles={(paths) => routeFiles(paths, onNavigate)} />
        </div>

        <RecentFiles onNavigate={onNavigate} />
      </div>
    </div>
  );
}
