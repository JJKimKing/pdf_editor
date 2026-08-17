import type { MetadataPatch, PdfMetadata } from "../../types/pdf";
import { formatDate } from "../../utils/format";
import { EditableField } from "../common/EditableField";
import { CustomFieldsSection } from "./CustomFieldsSection";

interface AdvancedInfoTableProps {
  metadata: PdfMetadata;
  onSave: (patch: MetadataPatch) => void | Promise<void>;
  onAddCustomField: (key: string, value: string) => void | Promise<void>;
  onRemoveCustomField: (key: string) => void | Promise<void>;
}

export function AdvancedInfoTable({
  metadata,
  onSave,
  onAddCustomField,
  onRemoveCustomField,
}: AdvancedInfoTableProps) {
  return (
    <>
      <section className="card">
        <h3 className="card__title">PDF Info Dictionary</h3>
        <div className="field-list field-list--wide">
          <EditableField label="/Title" value={metadata.title} onSave={(title) => onSave({ title })} />
          <EditableField label="/Author" value={metadata.author} onSave={(author) => onSave({ author })} />
          <EditableField label="/Subject" value={metadata.subject} onSave={(subject) => onSave({ subject })} />
          <EditableField label="/Keywords" value={metadata.keywords} onSave={(keywords) => onSave({ keywords })} />
          <EditableField label="/Creator" value={metadata.creator} onSave={(creator) => onSave({ creator })} />
          <EditableField label="/Producer" value={metadata.producer} onSave={(producer) => onSave({ producer })} />
          <div className="editable-row">
            <div className="editable-row__label">/CreationDate</div>
            <div className="editable-row__box editable-row__box--readonly">
              {formatDate(metadata.creationDate)}
            </div>
          </div>
          <div className="editable-row">
            <div className="editable-row__label">/ModDate</div>
            <div className="editable-row__box editable-row__box--readonly">
              {formatDate(metadata.modDate)}
            </div>
          </div>
        </div>
      </section>

      <CustomFieldsSection
        fields={metadata.custom}
        onAdd={onAddCustomField}
        onUpdate={onAddCustomField}
        onRemove={onRemoveCustomField}
      />
    </>
  );
}
