/**
 * Visible focus ring used across the module.
 *
 * Lives at the module root because 13 files consume it, including shared
 * components; it previously sat in `[inventory]/finance/labels.ts`, which made
 * every non-finance screen import from a screen folder. `finance/labels.ts`
 * re-exports it so existing imports keep working.
 */
export const FOCUS_RING = {
  outline: "2px solid",
  outlineColor: "content.link",
  outlineOffset: "2px",
} as const;
