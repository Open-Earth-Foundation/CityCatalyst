"use client";
import { Box, HStack, SimpleGrid, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedChartTip } from "./MeedChartTip";
import {
  scoreContributions,
  type MeedScoreWeights,
} from "../[inventory]/results/components/rankingFacts";

/**
 * One colour per pillar, in the order the formula reads. Blue / orange / green
 * survives the common colour-vision deficiencies, and every bar carries its
 * numbers so colour is never the only cue. The orange is a swatch only —
 * it does not pass as text on white.
 */
export const PILLAR_COLORS = [
  "content.link",
  "interactive.quaternary",
  "interactive.tertiary",
] as const;

const PILLARS = ["impact", "alignment", "feasibility"] as const;
type Pillar = (typeof PILLARS)[number];

const PILLAR_LABEL_KEY: Record<Pillar, string> = {
  impact: "composition-impact",
  alignment: "composition-alignment",
  feasibility: "composition-feasibility",
};

const PILLAR_DESCRIPTION_KEY: Record<Pillar, string> = {
  impact: "impact-score-description",
  alignment: "alignment-score-description",
  feasibility: "feasibility-score-description",
};

function scoreOf(action: MeedRankedActionResult, pillar: Pillar): number {
  return pillar === "impact"
    ? action.impact_score
    : pillar === "alignment"
      ? action.alignment_score
      : action.feasibility_score;
}

export interface MeedScoreCompositionProps {
  action: MeedRankedActionResult;
  weights: MeedScoreWeights;
  /**
   * `bar`: the stacked bar alone (the caller prints the number elsewhere).
   * `compact`: bar + final score on one line.
   * `detailed`: bar + one tile per pillar with its score and meaning.
   */
  variant?: "bar" | "compact" | "detailed";
  /** `meed-results` namespace. */
  t: TFunction;
}

/**
 * How an action's final score is made up: a stacked bar whose three segments
 * are the weighted contributions of impact, alignment and feasibility, on the
 * same 0..1 scale as the final score. Two actions with the same final score
 * can look completely different here, which is exactly the point — the number
 * alone hides whether an action won on impact or on policy backing.
 *
 * The formula (score × weight = contribution) lives in the hover tip, so the
 * layout never has to print it.
 */
export function MeedScoreComposition({
  action,
  weights,
  variant = "compact",
  t,
}: MeedScoreCompositionProps) {
  const parts = scoreContributions(action, weights);
  const ariaLabel = t("composition-aria", {
    final: action.final_score.toFixed(2),
    impact: parts.impact.toFixed(2),
    alignment: parts.alignment.toFixed(2),
    feasibility: parts.feasibility.toFixed(2),
  });

  const bar = (
    <MeedChartTip
      title={t("composition-tip-title", {
        final: action.final_score.toFixed(2),
      })}
      rows={PILLARS.map((pillar, i) => ({
        label: t(PILLAR_LABEL_KEY[pillar]),
        swatch: PILLAR_COLORS[i],
        value: t("composition-row", {
          score: scoreOf(action, pillar).toFixed(2),
          weight: weights[pillar].toFixed(2),
          result: parts[pillar].toFixed(2),
        }),
      }))}
      note={t("composition-tip-note")}
    >
      <Box role="img" aria-label={ariaLabel} w="full" tabIndex={-1}>
        <SegmentedProgress
          values={[parts.impact, parts.alignment, parts.feasibility]}
          colors={[...PILLAR_COLORS]}
          max={1}
          height={variant === "detailed" ? 3 : 2}
        />
      </Box>
    </MeedChartTip>
  );

  if (variant === "bar") return bar;

  if (variant === "compact") {
    return (
      <HStack gap="s" alignItems="center" w="full">
        {bar}
        <BodySmall
          color="content.primary"
          fontWeight="semibold"
          fontVariantNumeric="tabular-nums"
          flexShrink={0}
          minW="34px"
          textAlign="end"
        >
          {action.final_score.toFixed(2)}
        </BodySmall>
      </HStack>
    );
  }

  return (
    <VStack alignItems="stretch" gap="m">
      {bar}
      <SimpleGrid columns={{ base: 1, sm: 3 }} gap="m">
        {PILLARS.map((pillar, i) => (
          <VStack
            key={pillar}
            alignItems="stretch"
            gap="xs"
            p="l"
            borderRadius="rounded"
            bg="background.graySubtle"
          >
            <HStack gap="xs" alignItems="center">
              <Box
                w="10px"
                h="10px"
                borderRadius="full"
                bg={PILLAR_COLORS[i]}
                flexShrink={0}
              />
              <Overline color="content.tertiary">
                {t(PILLAR_LABEL_KEY[pillar])}
              </Overline>
            </HStack>
            <HStack alignItems="baseline" gap="xs">
              <TitleMedium
                color="content.primary"
                fontVariantNumeric="tabular-nums"
              >
                {scoreOf(action, pillar).toFixed(2)}
              </TitleMedium>
              <Caption
                color="content.tertiary"
                fontVariantNumeric="tabular-nums"
              >
                {t("composition-weight-short", {
                  weight: Math.round(weights[pillar] * 100),
                })}
              </Caption>
            </HStack>
            <BodySmall color="content.secondary">
              {t(PILLAR_DESCRIPTION_KEY[pillar])}
            </BodySmall>
          </VStack>
        ))}
      </SimpleGrid>
    </VStack>
  );
}

/**
 * The legend for the composition bars, rendered once per screen rather than
 * once per card: three swatches, and the formula with the weights this ranking
 * actually used.
 */
export function MeedScoreLegend({
  weights,
  t,
}: {
  weights: MeedScoreWeights;
  t: TFunction;
}) {
  return (
    <HStack gap="m" flexWrap="wrap" alignItems="center">
      {PILLARS.map((pillar, i) => (
        <HStack key={pillar} gap="xs" alignItems="center">
          <Box
            w="10px"
            h="10px"
            borderRadius="full"
            bg={PILLAR_COLORS[i]}
            flexShrink={0}
          />
          <BodySmall color="content.secondary">
            {t(PILLAR_LABEL_KEY[pillar])}
          </BodySmall>
        </HStack>
      ))}
      <BodySmall color="content.tertiary" fontVariantNumeric="tabular-nums">
        {t("score-formula-caption", {
          wi: weights.impact.toFixed(2),
          wa: weights.alignment.toFixed(2),
          wf: weights.feasibility.toFixed(2),
        })}
      </BodySmall>
    </HStack>
  );
}
