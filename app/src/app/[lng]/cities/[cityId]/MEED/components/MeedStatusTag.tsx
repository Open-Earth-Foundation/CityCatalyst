"use client";
import { Tag } from "@/components/ui/tag";
import type { TagProps } from "@/components/ui/tag";
import type { MeedSectionStatus } from "../meedStatus";
import { MEED_TONE, type MeedTone } from "./meedTones";

/**
 * Small status pill used across the module.
 *
 * Colours come from the module's tone map (`meedTones.ts`) rather than through
 * Chakra's `colorPalette` (which lands on stock greys) or the theme's
 * `tagRecipe` status variants (which are registered as a plain recipe while
 * Chakra expects a slot recipe, so they never render — see the root backlog).
 */
export type { MeedTone } from "./meedTones";

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
  const styles = MEED_TONE[tone];
  return (
    <Tag
      bg={styles.bg}
      color={styles.fg}
      borderColor={styles.border}
      borderWidth="1px"
      borderRadius="pill"
      px="m"
      py="xs"
      fontSize="label.sm"
      fontWeight="semibold"
      whiteSpace="nowrap"
      flexShrink={0}
      // Chakra's tag recipe line-clamps the label, which turned short status
      // words into "Self-…" whenever the column got tight. These labels are a
      // handful of characters; they should never be abbreviated.
      css={{
        "& [data-part='label'], & .chakra-tag__label": {
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
