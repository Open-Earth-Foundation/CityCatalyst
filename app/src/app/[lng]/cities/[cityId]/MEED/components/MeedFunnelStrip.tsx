"use client";
import { Box, Grid, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuChevronRight } from "react-icons/lu";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { Overline } from "@/components/package/Texts/Overline";
import { HeadlineLarge } from "@/components/package/Texts/Headline";
import { LabelMedium } from "@/components/package/Texts/Label";
import { TitleLarge } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import type { MeedTone } from "./MeedStatusTag";
import { MeedChartTip } from "./MeedChartTip";

const TONE_COLOR: Record<MeedTone, string> = {
  neutral: "content.tertiary",
  info: "content.link",
  positive: "interactive.tertiary",
  warning: "sentiment.warningFg",
  caution: "sentiment.warningFg",
  negative: "sentiment.negativeDefault",
};

export interface MeedFunnelStep {
  label: string;
  value: number;
  tone: MeedTone;
  sublabel?: string;
}

export interface MeedFunnelStripProps {
  /** Widest stage first, e.g. assessed → passed → ranked. */
  steps: MeedFunnelStep[];
  /** Compact drops the sublabels and shrinks the numbers, for a context card. */
  compact?: boolean;
  /** Keep full-size numbers but hide the sublabels (they stay in the tooltip). */
  showSublabels?: boolean;
  /** `lg` makes the numbers the size of a score, for a section that is about them. */
  size?: "md" | "lg";
  ariaLabel: string;
  /** Hover explanation; the stage sublabels become its rows. */
  tipTitle?: string;
  tipNote?: string;
}

/**
 * A narrowing pipeline as three numbers over one bar. The bar's segments are
 * the *differences* between stages (what each stage kept vs. dropped), drawn
 * in reverse so the final stage sits at the left edge in the strongest colour.
 */
export function MeedFunnelStrip({
  steps,
  compact = false,
  showSublabels = true,
  size = "md",
  ariaLabel,
  tipTitle,
  tipNote,
}: MeedFunnelStripProps) {
  const max = steps[0]?.value ?? 0;
  // Segment i = what stage i kept that stage i+1 did not (last stage = itself).
  const segments = steps.map((step, i) =>
    Math.max(step.value - (steps[i + 1]?.value ?? 0), 0),
  );
  const reversed = [...steps].reverse();
  const reversedSegments = [...segments].reverse();

  const strip = (
    <VStack
      alignItems="stretch"
      gap="m"
      w="full"
      role="img"
      aria-label={ariaLabel}
      tabIndex={-1}
    >
      {compact ? (
        <HStack justifyContent="space-between" alignItems="flex-start" gap="m">
          {steps.map((step) =>
            size === "lg" && !compact ? (
              <VStack
                key={step.label}
                alignItems="flex-start"
                gap="xs"
                minW={0}
              >
                <LabelMedium color="content.tertiary">{step.label}</LabelMedium>
                <HeadlineLarge
                  color={TONE_COLOR[step.tone]}
                  fontVariantNumeric="tabular-nums"
                  lineHeight="1"
                >
                  {step.value}
                </HeadlineLarge>
                {showSublabels && step.sublabel && (
                  <BodySmall color="content.secondary">
                    {step.sublabel}
                  </BodySmall>
                )}
              </VStack>
            ) : (
              <VStack key={step.label} alignItems="flex-start" gap="0" minW={0}>
                <Overline color="content.tertiary">{step.label}</Overline>
                <TitleLarge
                  color={TONE_COLOR[step.tone]}
                  fontVariantNumeric="tabular-nums"
                  fontSize={compact ? "title.md" : undefined}
                >
                  {step.value}
                </TitleLarge>
                {!compact && showSublabels && step.sublabel && (
                  <Caption color="content.secondary">{step.sublabel}</Caption>
                )}
              </VStack>
            ),
          )}
        </HStack>
      ) : (
        <Grid
          templateColumns={{
            base: "repeat(2, minmax(0, 1fr))",
            md: "repeat(3, minmax(0, 1fr))",
            lg: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
          gap="l"
        >
          {steps.map((step, i) =>
            size === "lg" && !compact ? (
              <VStack
                key={step.label}
                alignItems="flex-start"
                gap="xs"
                minW={0}
                position="relative"
              >
                {/* One row on wide screens: a chevron in each gap says the
                    stages read left to right, from the bank to the ranking. */}
                {i < steps.length - 1 && (
                  <Icon
                    as={LuChevronRight}
                    boxSize="20px"
                    color="content.tertiary"
                    position="absolute"
                    right="-22px"
                    top="30px"
                    display={{ base: "none", lg: "block" }}
                    aria-hidden
                  />
                )}
                <LabelMedium color="content.tertiary">{step.label}</LabelMedium>
                <HeadlineLarge
                  color={TONE_COLOR[step.tone]}
                  fontVariantNumeric="tabular-nums"
                  lineHeight="1"
                >
                  {step.value}
                </HeadlineLarge>
                {showSublabels && step.sublabel && (
                  <BodySmall color="content.secondary">
                    {step.sublabel}
                  </BodySmall>
                )}
              </VStack>
            ) : (
              <VStack key={step.label} alignItems="flex-start" gap="0" minW={0}>
                <Overline color="content.tertiary">{step.label}</Overline>
                <TitleLarge
                  color={TONE_COLOR[step.tone]}
                  fontVariantNumeric="tabular-nums"
                  fontSize={compact ? "title.md" : undefined}
                >
                  {step.value}
                </TitleLarge>
                {!compact && showSublabels && step.sublabel && (
                  <Caption color="content.secondary">{step.sublabel}</Caption>
                )}
              </VStack>
            ),
          )}
        </Grid>
      )}
      <Box>
        <SegmentedProgress
          values={reversedSegments}
          colors={reversed.map((s) => TONE_COLOR[s.tone])}
          max={max || 1}
          height={compact ? 2 : size === "lg" ? 4 : 3}
        />
      </Box>
    </VStack>
  );

  if (!tipTitle) return strip;
  return (
    <MeedChartTip
      title={tipTitle}
      rows={steps.map((step) => ({
        label: step.sublabel ? `${step.label} — ${step.sublabel}` : step.label,
        swatch: TONE_COLOR[step.tone],
        value: String(step.value),
      }))}
      note={tipNote}
    >
      {strip}
    </MeedChartTip>
  );
}
