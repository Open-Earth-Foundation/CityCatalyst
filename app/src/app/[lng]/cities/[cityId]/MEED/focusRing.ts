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

/**
 * The same ring for controls sitting on a saturated background, where
 * `content.link` would disappear into the fill. Same geometry, inverted colour
 * — the only legitimate reason to deviate from FOCUS_RING.
 */
export const FOCUS_RING_INVERSE = {
  ...FOCUS_RING,
  outlineColor: "base.light",
} as const;
