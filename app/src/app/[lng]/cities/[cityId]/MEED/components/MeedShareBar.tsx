"use client";
import { Box, HStack, VStack } from "@chakra-ui/react";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedChartTip } from "./MeedChartTip";

export interface MeedShareSegment {
  label: string;
  value: number;
  /** Colour token or hex. */
  color: string;
}

export interface MeedShareBarProps {
  segments: MeedShareSegment[];
  /** Shown as "label · value" in the legend; defaults to a percentage of the total. */
  formatValue?: (segment: MeedShareSegment, total: number) => string;
  ariaLabel: string;
  tipTitle?: string;
  tipNote?: string;
}

/**
 * A 100% bar with its legend, for "how does this split" questions: financing
 * routes, sector shares. Zero-value segments are dropped from both bar and
 * legend so the picture never shows an empty swatch.
 */
export function MeedShareBar({
  segments,
  formatValue,
  ariaLabel,
  tipTitle,
  tipNote,
}: MeedShareBarProps) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  if (shown.length === 0 || total <= 0) return null;
  const format =
    formatValue ??
    ((s: MeedShareSegment) => `${Math.round((s.value / total) * 100)}%`);

  const bar = (
    <Box role="img" aria-label={ariaLabel} tabIndex={-1}>
      <SegmentedProgress
        values={shown.map((s) => s.value)}
        colors={shown.map((s) => s.color)}
        max={total}
        height={2}
      />
    </Box>
  );

  return (
    <VStack alignItems="stretch" gap="s" w="full">
      {tipTitle ? (
        <MeedChartTip
          title={tipTitle}
          rows={shown.map((s) => ({
            label: s.label,
            swatch: s.color,
            value: format(s, total),
          }))}
          note={tipNote}
        >
          {bar}
        </MeedChartTip>
      ) : (
        bar
      )}
      <HStack gap="m" flexWrap="wrap">
        {shown.map((s) => (
          <HStack key={s.label} gap="xs" alignItems="center">
            <Box
              boxSize="8px"
              borderRadius="full"
              bg={s.color}
              flexShrink={0}
            />
            <BodySmall
              color="content.secondary"
              fontVariantNumeric="tabular-nums"
            >
              {`${s.label} · ${format(s, total)}`}
            </BodySmall>
          </HStack>
        ))}
      </HStack>
    </VStack>
  );
}
