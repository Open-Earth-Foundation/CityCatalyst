"use client";
import React from "react";
import { Box, Icon, HStack, VStack } from "@chakra-ui/react";
import { LuArrowLeft, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { MeedButton } from "../../../components/MeedButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { ScoreBar } from "./ScoreBar";
import { actionName, sectorLabel, type MeedActionIndex } from "./actionCatalog";
import {
  actionCoBenefits,
  actionTradeOffs,
  coBenefitLabel,
} from "./coBenefits";

export interface ScoreWeights {
  impact: number;
  alignment: number;
  feasibility: number;
}

/**
 * One list of co-benefit keys under a heading. Renders nothing when empty, so
 * an action with no trade-offs shows no trade-offs section rather than an
 * empty one.
 */
function CoBenefitSection({
  title,
  keys,
  icon,
  color,
  t,
}: {
  title: string;
  keys: string[];
  icon: React.ElementType;
  color: string;
  t: TFunction;
}) {
  if (keys.length === 0) return null;

  return (
    <VStack alignItems="stretch" gap="s">
      <LabelLarge color="content.primary">{title}</LabelLarge>
      <VStack alignItems="stretch" gap="xs">
        {keys.map((key) => (
          <HStack key={key} gap="s" alignItems="center">
            <Icon as={icon} boxSize="16px" color={color} flexShrink={0} />
            <BodyMedium color="content.secondary">
              {coBenefitLabel(key, t)}
            </BodyMedium>
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}

/**
 * Right-hand drawer with the full score breakdown for one ranked action:
 * description, ranking explanation and the three weighted component scores
 * plus the final-score formula.
 */
export function DetailPanel({
  action,
  index,
  weights,
  t,
  onClose,
}: {
  action: MeedRankedActionResult;
  index: MeedActionIndex;
  weights: ScoreWeights;
  t: TFunction;
  onClose: () => void;
}) {
  const description = index.get(action.action_id)?.description;
  const explanation =
    action.explanations?.en ?? Object.values(action.explanations ?? {})[0];
  const coBenefits = actionCoBenefits(action, index);
  const tradeOffs = actionTradeOffs(action, index);

  return (
    <>
      <Box
        position="fixed"
        inset="0"
        bg="content.primary"
        opacity={0.3}
        zIndex={40}
        onClick={onClose}
      />
      <Box
        position="fixed"
        top="0"
        right="0"
        bottom="0"
        w={{ base: "full", md: "460px" }}
        bg="base.light"
        zIndex={50}
        boxShadow="lg"
        display="flex"
        flexDirection="column"
      >
        <Box
          px="l"
          py="l"
          borderBottomWidth="1px"
          borderColor="border.overlay"
          flexShrink={0}
        >
          <MeedButton
            variant="text"
            px="0"
            leftIcon={<Icon as={LuArrowLeft} />}
            onClick={onClose}
          >
            {t("detail-close")}
          </MeedButton>
          <LabelMedium
            color="content.link"
            textTransform="uppercase"
            letterSpacing="0.08em"
            mt="m"
          >
            {sectorLabel(index, action.action_id, t)}
          </LabelMedium>
          <TitleMedium color="content.primary" mt="xs">
            {actionName(index, action.action_id, t)}
          </TitleMedium>
        </Box>

        <Box px="l" py="l" flex="1" overflowY="auto">
          <VStack alignItems="stretch" gap="l">
            <VStack alignItems="stretch" gap="s">
              <LabelLarge color="content.primary">
                {t("detail-description")}
              </LabelLarge>
              <BodyMedium color="content.secondary">
                {description ?? t("no-description")}
              </BodyMedium>
            </VStack>

            {explanation && (
              <VStack alignItems="stretch" gap="s">
                <LabelLarge color="content.primary">
                  {t("detail-why")}
                </LabelLarge>
                <BodyMedium color="content.secondary" fontStyle="italic">
                  {explanation}
                </BodyMedium>
              </VStack>
            )}

            <VStack alignItems="stretch" gap="m">
              <LabelLarge color="content.primary">
                {t("detail-score-breakdown")}
              </LabelLarge>
              <ScoreBar
                label={t("impact-score")}
                value={action.impact_score}
                weight={weights.impact}
                color="content.link"
                description={t("impact-score-description")}
              />
              <ScoreBar
                label={t("alignment-score")}
                value={action.alignment_score}
                weight={weights.alignment}
                color="sentiment.warningDefault"
                description={t("alignment-score-description")}
              />
              <ScoreBar
                label={t("feasibility-score")}
                value={action.feasibility_score}
                weight={weights.feasibility}
                color="sentiment.positiveDefault"
                description={t("feasibility-score-description")}
              />
              <HStack
                justifyContent="space-between"
                gap="m"
                bg="background.neutral"
                borderRadius="rounded"
                px="m"
                py="m"
              >
                <BodySmall
                  color="content.secondary"
                  fontVariantNumeric="tabular-nums"
                >
                  {t("final-score-formula", {
                    i: action.impact_score.toFixed(2),
                    wi: weights.impact.toFixed(2),
                    a: action.alignment_score.toFixed(2),
                    wa: weights.alignment.toFixed(2),
                    f: action.feasibility_score.toFixed(2),
                    wf: weights.feasibility.toFixed(2),
                  })}
                </BodySmall>
                <BodyLarge
                  color="sentiment.positiveDefault"
                  fontWeight="bold"
                  flexShrink={0}
                  fontVariantNumeric="tabular-nums"
                >
                  {action.final_score.toFixed(3)}
                </BodyLarge>
              </HStack>
            </VStack>

            <CoBenefitSection
              title={t("detail-cobenefits")}
              keys={coBenefits}
              icon={LuCircleCheck}
              color="sentiment.positiveDefault"
              t={t}
            />

            <CoBenefitSection
              title={t("detail-tradeoffs")}
              keys={tradeOffs}
              icon={LuTriangleAlert}
              color="sentiment.warningDefault"
              t={t}
            />
          </VStack>
        </Box>
      </Box>
    </>
  );
}
