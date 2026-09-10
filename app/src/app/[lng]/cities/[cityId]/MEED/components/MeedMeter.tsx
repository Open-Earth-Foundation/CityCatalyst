"use client";
import { Box, HStack, Progress, VStack } from "@chakra-ui/react";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import type { MeedTone } from "./MeedStatusTag";

const TONE_COLOR: Record<MeedTone, string> = {
  neutral: "content.tertiary",
  info: "content.link",
  positive: "interactive.tertiary",
  warning: "sentiment.warningDefault",
  negative: "sentiment.negativeDefault",
};

export interface MeedMeterProps {
  /** 0..1 */
  value: number;
  tone?: MeedTone;
  label?: string;
  /** Right-aligned readout, e.g. "0.62" or "55%". */
  valueText?: string;
  /** Secondary right-aligned note, e.g. "× 0.55". */
  weightText?: string;
  /** Explanatory line under the bar. */
  description?: string;
  height?: string;
  /** Announced to screen readers when the numeric value alone isn't meaningful. */
  ariaLabel?: string;
}

/**
 * The single bar used for every score, weight and completion readout in the
 * module. Replaces five hand-rolled variants that disagreed on height, radius
 * and colour.
 *
 * Built on Chakra's Progress so it carries the right ARIA roles; the track and
 * range colours are set here because the theme's `progress` recipe is not
 * currently applied (see the root backlog).
 */
export function MeedMeter({
  value,
  tone = "info",
  label,
  valueText,
  weightText,
  description,
  height = "6px",
  ariaLabel,
}: MeedMeterProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));

  return (
    <VStack alignItems="stretch" gap="xs" w="full">
      {(label || valueText || weightText) && (
        <HStack justifyContent="space-between" alignItems="baseline" gap="s">
          {label && (
            <LabelMedium color="content.secondary">{label}</LabelMedium>
          )}
          <HStack gap="s" alignItems="baseline" flexShrink={0}>
            {valueText && (
              <LabelMedium
                color="content.primary"
                fontVariantNumeric="tabular-nums"
              >
                {valueText}
              </LabelMedium>
            )}
            {weightText && (
              <BodySmall color="content.tertiary">{weightText}</BodySmall>
            )}
          </HStack>
        </HStack>
      )}
      <Progress.Root
        value={pct}
        min={0}
        max={100}
        aria-label={ariaLabel ?? label}
        w="full"
      >
        <Progress.Track
          bg="border.overlay"
          h={height}
          borderRadius="full"
          overflow="hidden"
        >
          <Progress.Range bg={TONE_COLOR[tone]} borderRadius="full" />
        </Progress.Track>
      </Progress.Root>
      {description && (
        <Box>
          <BodySmall color="content.tertiary">{description}</BodySmall>
        </Box>
      )}
    </VStack>
  );
}
