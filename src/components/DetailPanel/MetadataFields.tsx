import type { MetadataPatch, PdfMetadata } from "../../types/pdf";
import { EditableField } from "../common/EditableField";

interface MetadataFieldsProps {
  metadata: PdfMetadata;
  onSave: (patch: MetadataPatch) => void | Promise<void>;
}

export function MetadataFields({ metadata, onSave }: MetadataFieldsProps) {
  return (
    <section className="card">
      <h3 className="card__title">元数据编辑</h3>
      <div className="field-list">
        <EditableField label="标题" value={metadata.title} onSave={(title) => onSave({ title })} />
        <EditableField label="主题" value={metadata.subject} onSave={(subject) => onSave({ subject })} />
        <EditableField label="作者" value={metadata.author} onSave={(author) => onSave({ author })} />
        <EditableField
          label="关键字"
          value={metadata.keywords}
          onSave={(keywords) => onSave({ keywords })}
        />
      </div>
    </section>
  );
}
