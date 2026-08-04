"use client";
import { Card, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge } from "@/components/package/Texts/Title";
import { MeedMeter } from "../../../components/MeedMeter";
import { alignmentLabelKey, scoreTone, TONE_TEXT_COLOR } from "../policyRows";

export interface ScopeScoreCardProps {
  scopeLabel: string;
  /** 0..1, or null when no plan at this scope is on record. */
  score: number | null;
  description: string;
  t: TFunction;
}

/** Aggregate alignment for one plan scope (national / regional / municipal). */
export function ScopeScoreCard({
  scopeLabel,
  score,
  description,
  t,
}: ScopeScoreCardProps) {
  const pct = score !== null ? Math.round(score * 100) : null;
  const tone = scoreTone(score);
  const textColor = TONE_TEXT_COLOR[tone];
  const alignmentLabel = t(alignmentLabelKey(score));

  return (
    <Card.Root h="full" borderColor="border.overlay">
      <Card.Body p="m">
        <VStack alignItems="stretch" gap="s" h="full">
          <HStack justifyContent="space-between" alignItems="center" gap="s">
            <Overline>{scopeLabel}</Overline>
            <TitleLarge color={textColor} fontVariantNumeric="tabular-nums">
              {pct !== null ? t("percent-value", { value: pct }) : "—"}
            </TitleLarge>
          </HStack>
          <MeedMeter
            value={score ?? 0}
            tone={tone}
            ariaLabel={`${scopeLabel} — ${alignmentLabel}`}
          />
          <LabelMedium color={textColor}>{alignmentLabel}</LabelMedium>
          <Caption>{description}</Caption>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
