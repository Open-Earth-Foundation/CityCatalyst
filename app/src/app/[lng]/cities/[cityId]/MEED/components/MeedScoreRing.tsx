"use client";
import { Box } from "@chakra-ui/react";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
  ProgressCircleValueText,
} from "@/components/ui/progress-circle";
import type { MeedTone } from "./MeedStatusTag";
import { MeedChartTip } from "./MeedChartTip";

const TONE_COLOR: Record<MeedTone, string> = {
  neutral: "content.tertiary",
  info: "content.link",
  positive: "interactive.tertiary",
  warning: "sentiment.warningDefault",
  negative: "sentiment.negativeDefault",
};

export interface MeedScoreRingProps {
  /** 0..1, or null when there is nothing to score (renders an empty ring). */
  value: number | null;
  tone: MeedTone;
  size?: "sm" | "md" | "lg" | "xl";
  /** Text inside the ring; defaults to the percentage. */
  valueText?: string;
  ariaLabel: string;
  /** Hover explanation of what the percentage means. */
  tipTitle?: string;
  tipNote?: string;
}

/**
 * A percentage as a ring, for the three policy-alignment scopes. Same tone
 * palette as `MeedMeter`, so a ring and a bar for the same score agree.
 */
export function MeedScoreRing({
  value,
  tone,
  size = "lg",
  valueText,
  ariaLabel,
  tipTitle,
  tipNote,
}: MeedScoreRingProps) {
  const pct = value === null ? 0 : Math.round(value * 100);
  const ring = (
    <Box role="img" aria-label={ariaLabel} flexShrink={0} tabIndex={-1}>
      <ProgressCircleRoot value={pct} size={size}>
        <ProgressCircleRing
          color={value === null ? "border.overlay" : TONE_COLOR[tone]}
          trackColor="border.overlay"
          cap="round"
        />
        <ProgressCircleValueText
          fontFamily="heading"
          fontWeight="semibold"
          fontVariantNumeric="tabular-nums"
          color={value === null ? "content.tertiary" : "content.primary"}
        >
          {valueText ?? (value === null ? "—" : `${pct}%`)}
        </ProgressCircleValueText>
      </ProgressCircleRoot>
    </Box>
  );
  if (!tipTitle) return ring;
  return (
    <MeedChartTip
      title={tipTitle}
      rows={[{ label: ariaLabel, value: value === null ? "—" : `${pct}%` }]}
      note={tipNote}
    >
      {ring}
    </MeedChartTip>
  );
}
