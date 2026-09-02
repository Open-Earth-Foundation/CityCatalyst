"use client";
import { Tag } from "@/components/ui/tag";
import type { TagProps } from "@/components/ui/tag";
import type { MeedSectionStatus } from "../meedStatus";

/**
 * Small status pill used across the module.
 *
 * Colours are set explicitly from semantic tokens rather than through Chakra's
 * `colorPalette` (which lands on stock greys) or the theme's `tagRecipe`
 * status variants (which are registered as a plain recipe while Chakra expects
 * a slot recipe, so they never render — see the root backlog).
 */
export type MeedTone = "neutral" | "info" | "positive" | "warning" | "negative";

const TONE_STYLES: Record<
  MeedTone,
  { bg: string; color: string; borderColor: string }
> = {
  neutral: {
    bg: "background.neutral",
    color: "content.secondary",
    borderColor: "border.neutral",
  },
  info: {
    bg: "background.neutral",
    color: "content.link",
    borderColor: "content.link",
  },
  positive: {
    bg: "sentiment.positiveOverlay",
    color: "interactive.tertiary",
    borderColor: "interactive.tertiary",
  },
  warning: {
    bg: "sentiment.warningOverlay",
    color: "sentiment.warningDefault",
    borderColor: "sentiment.warningDefault",
  },
  negative: {
    bg: "sentiment.negativeOverlay",
    color: "sentiment.negativeDefault",
    borderColor: "sentiment.negativeDefault",
  },
};

export const STATUS_TONE: Record<MeedSectionStatus, MeedTone> = {
  "not-started": "neutral",
  "in-progress": "warning",
  "needs-review": "info",
  complete: "positive",
};

/** i18n keys in the `meed` namespace. */
export const STATUS_LABEL_KEY: Record<MeedSectionStatus, string> = {
  "not-started": "status-not-started",
  "in-progress": "status-in-progress",
  "needs-review": "status-needs-review",
  complete: "status-complete",
};

export interface MeedStatusTagProps extends Omit<TagProps, "colorPalette"> {
  tone?: MeedTone;
}

export function MeedStatusTag({
  tone = "neutral",
  children,
  ...rest
}: MeedStatusTagProps) {
  const styles = TONE_STYLES[tone];
  return (
    <Tag
      bg={styles.bg}
      color={styles.color}
      borderColor={styles.borderColor}
      borderWidth="1px"
      borderRadius="pill"
      px="s"
      py="xs"
      fontSize="label.sm"
      fontWeight="semibold"
      whiteSpace="nowrap"
      flexShrink={0}
      // Chakra's tag recipe line-clamps the label, which turned short status
      // words into "Self-…" whenever the column got tight. These labels are a
      // handful of characters; they should never be abbreviated.
      css={{
        "& [data-part='label']": {
          lineClamp: "unset",
          WebkitLineClamp: "unset",
          display: "inline",
          overflow: "visible",
          whiteSpace: "nowrap",
        },
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
