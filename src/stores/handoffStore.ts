import type { ViewId } from "../app/routes";

/**
 * One-shot file handoff between pages — e.g. Home's drop zone picks a
 * target page (PDF→DOCX, DOCX→PDF, or Metadata) and hands it the dropped
 * paths so the destination page opens with those files already queued,
 * instead of routing + re-picking.
 */
interface Handoff {
  view: ViewId;
  paths: string[];
}

let pending: Handoff | null = null;

export const handoffStore = {
  set(view: ViewId, paths: string[]) {
    pending = { view, paths };
  },
  /** Consumes (and clears) the pending handoff if it targets `view`. */
  consume(view: ViewId): string[] | null {
    if (pending && pending.view === view) {
      const paths = pending.paths;
      pending = null;
      return paths;
    }
    return null;
  },
};
