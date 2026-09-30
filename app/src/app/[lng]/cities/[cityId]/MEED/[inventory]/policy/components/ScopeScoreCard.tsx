"use client";
import { Card, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedScoreRing } from "../../../components/MeedScoreRing";
import { alignmentLabelKey, scoreTone, TONE_TEXT_COLOR } from "../policyRows";

export interface ScopeScoreCardProps {
  scopeLabel: string;
  /** 0..1, or null when no plan at this scope is on record. */
  score: number | null;
  description: string;
  t: TFunction;
}

/**
 * Aggregate alignment for one plan scope (national / regional / municipal),
 * read as a ring so the three scopes compare at a glance.
 */
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
        <HStack alignItems="center" gap="m" h="full">
          <MeedScoreRing
            value={score}
            tone={tone}
            size="lg"
            ariaLabel={t("ring-aria", {
              scope: scopeLabel,
              value: pct !== null ? t("percent-value", { value: pct }) : "—",
            })}
            tipTitle={scopeLabel}
            tipNote={t("ring-note")}
            t={t}
          />
          <VStack alignItems="stretch" gap="xs" flex="1" minW={0}>
            <Overline>{scopeLabel}</Overline>
            <LabelMedium color={textColor}>{alignmentLabel}</LabelMedium>
            <Caption>{description}</Caption>
          </VStack>
        </HStack>
      </Card.Body>
    </Card.Root>
  );
}
