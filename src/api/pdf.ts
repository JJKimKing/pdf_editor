/**
 * Typed wrappers around the Tauri commands defined in
 * src-tauri/src/commands/{files,metadata}.rs. This is the only module
 * allowed to call `invoke` — components should import from here, not from
 * `@tauri-apps/api/core` directly, so the IPC surface stays in one place.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  BatchResult,
  MetadataPatch,
  PdfBasicInfo,
  PdfMetadata,
} from "../types/pdf";

export const pdfApi = {
  addFiles: (paths: string[]) =>
    invoke<PdfBasicInfo[]>("add_files", { paths }),

  addFolder: (dirPath: string, recursive: boolean) =>
    invoke<PdfBasicInfo[]>("add_folder", { dirPath, recursive }),

  removeFile: (id: string) => invoke<void>("remove_file", { id }),

  clearFiles: () => invoke<void>("clear_files"),

  listFiles: () => invoke<PdfBasicInfo[]>("list_files"),

  getMetadata: (id: string) => invoke<PdfMetadata>("get_metadata", { id }),

  updateMetadata: (id: string, patch: MetadataPatch) =>
    invoke<PdfMetadata>("update_metadata", { id, patch }),

  clearMetadata: (id: string) => invoke<PdfMetadata>("clear_metadata", { id }),

  setCustomField: (id: string, key: string, value: string) =>
    invoke<PdfMetadata>("set_custom_field", { id, key, value }),

  removeCustomField: (id: string, key: string) =>
    invoke<PdfMetadata>("remove_custom_field", { id, key }),

  batchUpdateMetadata: (ids: string[], patch: MetadataPatch) =>
    invoke<BatchResult[]>("batch_update_metadata", { ids, patch }),

  batchClearMetadata: (ids: string[]) =>
    invoke<BatchResult[]>("batch_clear_metadata", { ids }),
};
