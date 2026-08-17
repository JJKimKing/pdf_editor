/**
 * Mirrors src-tauri/src/pdf/model.rs — keep both in sync. Field names use
 * camelCase on both sides (serde `rename_all = "camelCase"`).
 */

export type FileStatus = "unmodified" | "modified" | "error";

export interface PdfBasicInfo {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  pageCount: number;
  pdfVersion: string;
  createdAt: string | null;
  modifiedAt: string | null;
  status: FileStatus;
}

export interface CustomField {
  key: string;
  value: string;
}

export interface PdfMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
  /** Arbitrary /Info entries outside the standard PDF keys above. */
  custom: CustomField[];
}

/**
 * `undefined`/absent field = leave unchanged; `""` = clear the field.
 * Matches Rust `MetadataPatch` where `None` = unchanged, `Some(s)` = set.
 */
export interface MetadataPatch {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
}

export interface BatchResult {
  id: string;
  success: boolean;
  error: string | null;
}

/** Basic-mode editable field keys, in display order. */
export const BASIC_METADATA_FIELDS = [
  "title",
  "author",
  "subject",
  "keywords",
] as const satisfies readonly (keyof MetadataPatch)[];

/** Advanced-mode /Info dictionary keys, in display order (read-only ones excluded from patches). */
export const INFO_DICT_KEYS = [
  "/Title",
  "/Author",
  "/Subject",
  "/Keywords",
  "/Creator",
  "/Producer",
  "/CreationDate",
  "/ModDate",
] as const;
