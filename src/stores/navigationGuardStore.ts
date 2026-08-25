/**
 * Lets a page (currently only the Metadata editor) veto a sidebar
 * navigation while it has unsaved changes, reusing the same confirm dialog
 * as the in-page "switch to another PDF while dirty" guard (product spec
 * §24). `check()` resolves `true` when it's safe to leave.
 */
type Guard = () => Promise<boolean>;

let guard: Guard | null = null;

export const navigationGuard = {
  set(fn: Guard | null) {
    guard = fn;
  },
  async check(): Promise<boolean> {
    return guard ? guard() : true;
  },
};
