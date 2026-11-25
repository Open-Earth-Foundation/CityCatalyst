/**
 * The module's six tones and the one colour set each maps to.
 *
 * Every status tag, meter, ring, funnel step and level dot in MEED reads from
 * this map, so a tone looks the same wherever it appears. Keep the values as
 * theme tokens; the sentiment tokens carry meaning (good / caution / bad),
 * the interactive ones are for controls and are only borrowed where the theme
 * has no sentiment colour yet.
 */
export type MeedTone =
  | "neutral"
  | "info"
  | "positive"
  | "warning"
  | "caution"
  | "negative";

export interface MeedToneStyle {
  /** Text and icon colour. */
  fg: string;
  /** Fill behind a tag. */
  bg: string;
  /** Tag outline. */
  border: string;
  /** Solid mark: a meter range, a ring arc, a level dot. */
  dot: string;
}

export const MEED_TONE: Record<MeedTone, MeedToneStyle> = {
  neutral: {
    fg: "content.secondary",
    bg: "background.neutral",
    border: "border.neutral",
    dot: "content.tertiary",
  },
  info: {
    fg: "content.link",
    bg: "background.neutral",
    border: "content.link",
    dot: "content.link",
  },
  positive: {
    fg: "sentiment.positiveDefault",
    bg: "sentiment.positiveOverlay",
    border: "sentiment.positiveDefault",
    dot: "sentiment.positiveDefault",
  },
  // Dark amber text: the yellow default fails contrast on its own overlay.
  warning: {
    fg: "sentiment.warningFg",
    bg: "sentiment.warningOverlay",
    border: "sentiment.warningDefault",
    dot: "sentiment.warningDefault",
  },
  // Orange, between warning (yellow) and negative (red). The theme has no
  // sentiment token for it, so the orange control colour stands in.
  caution: {
    fg: "sentiment.warningFg",
    bg: "sentiment.warningSubtle",
    border: "interactive.quaternary",
    dot: "interactive.quaternary",
  },
  negative: {
    fg: "sentiment.negativeDefault",
    bg: "sentiment.negativeOverlay",
    border: "sentiment.negativeDefault",
    dot: "sentiment.negativeDefault",
  },
};

/** Text colour per tone, for numbers and labels shown next to a mark. */
export const MEED_TONE_FG: Record<MeedTone, string> = Object.fromEntries(
  Object.entries(MEED_TONE).map(([tone, style]) => [tone, style.fg]),
) as Record<MeedTone, string>;

/** Solid mark colour per tone. */
export const MEED_TONE_DOT: Record<MeedTone, string> = Object.fromEntries(
  Object.entries(MEED_TONE).map(([tone, style]) => [tone, style.dot]),
) as Record<MeedTone, string>;
