"use client";
import React from "react";
import {
  Box,
  Card,
  Grid,
  GridItem,
  HStack,
  Icon,
  VStack,
} from "@chakra-ui/react";
import {
  LuChartColumn,
  LuClock,
  LuCoins,
  LuFactory,
  LuScale,
  LuSparkles,
  LuClipboardList,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import type { IconType } from "react-icons";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import type { MeedRankingInsights } from "../[inventory]/results/components/rankingInsights";
import type {
  MeedLegalFunnel,
  MeedPolicyBacking,
} from "../[inventory]/results/components/rankingFacts";
import { MeedStatusTag } from "./MeedStatusTag";

export interface MeedRankingSummaryProps {
  insights: MeedRankingInsights;
  funnel: MeedLegalFunnel | null;
  backing: MeedPolicyBacking;
  nationalPolicy: number | null;
  /** Inputs the model used, already worded — rendered as one row of tags. */
  inputs: string[];
  /** Catalog sector tag → label. */
  sectorLabelFor: (tag: string) => string;
  /** Inventory sector name (e.g. "transportation") → label. */
  inventorySectorLabelFor: (name: string) => string;
  /** `meed-results` namespace. */
  t: TFunction;
  /** The configuration row (preferences, exclusions, weights), rendered below. */
  config?: React.ReactNode;
}

const PILLAR_KEY = {
  impact: "composition-impact",
  alignment: "composition-alignment",
  feasibility: "composition-feasibility",
} as const;

/**
 * What the model used and what came out — in five sentences with numbers,
 * above the ranking. Every line is derived from the ranking and the context
 * queries; nothing is generated, so it is exactly as true as the cards below.
 */
export function MeedRankingSummary({
  insights,
  funnel,
  backing,
  nationalPolicy,
  inputs,
  sectorLabelFor,
  inventorySectorLabelFor,
  t,
  config,
}: MeedRankingSummaryProps) {
  const lines: { icon: IconType; text: string }[] = [];
  const total = insights.rankedCount;

  const topRanked = insights.sectorCounts[0];
  const topEm = insights.topEmissionSector;
  if (topRanked && topEm) {
    const sharePct = Math.round(topEm.share * 100);
    const topEmLabel = inventorySectorLabelFor(topEm.name);
    const topRankedLabel = sectorLabelFor(topRanked.tag);
    lines.push({
      icon: LuFactory,
      text:
        topRankedLabel === topEmLabel
          ? t("insight-sector-focus", {
              count: topRanked.count,
              total,
              sector: topRankedLabel,
              share: sharePct,
            })
          : t("insight-sector-mismatch", {
              count: topRanked.count,
              total,
              sector: topRankedLabel,
              topSector: topEmLabel,
              share: sharePct,
              topCount: topEm.rankedCount,
            }),
    });
  }

  if (insights.mainDriver) {
    lines.push({
      icon: LuChartColumn,
      text: t("insight-driver", {
        pillar: t(PILLAR_KEY[insights.mainDriver.pillar]),
        pct: Math.round(insights.mainDriver.share * 100),
      }),
    });
  }

  if (funnel) {
    lines.push({
      icon: LuScale,
      text: t("insight-legal", {
        excluded: funnel.assessed - funnel.passed,
        assessed: funnel.assessed,
        passed: funnel.passed,
      }),
    });
  }

  lines.push({
    icon: LuClipboardList,
    text:
      nationalPolicy !== null
        ? t("insight-policy", {
            strong: backing.strong,
            total,
            pct: Math.round(nationalPolicy * 100),
          })
        : t("insight-policy-no-plan", { strong: backing.strong, total }),
  });

  if (insights.selfDeliverable && insights.selfDeliverable.total > 0) {
    lines.push({
      icon: LuCoins,
      text: t("insight-finance", {
        count: insights.selfDeliverable.count,
        total: insights.selfDeliverable.total,
      }),
    });
  }

  lines.push({
    icon: LuClock,
    text: t("insight-timeline", {
      count: insights.shortTerm.count,
      total: insights.shortTerm.total,
    }),
  });

  return (
    <Card.Root borderColor="border.overlay">
      <Card.Body p="l">
        <Grid templateColumns={{ base: "1fr", lg: "2fr 3fr" }} gap="l">
          <GridItem>
            <VStack alignItems="stretch" gap="s">
              <Overline color="content.tertiary">
                {t("summary-inputs-title")}
              </Overline>
              <TitleMedium color="content.primary">
                {t("summary-inputs-heading")}
              </TitleMedium>
              <HStack gap="s" flexWrap="wrap">
                {inputs.map((label) => (
                  <MeedStatusTag key={label} tone="neutral">
                    {label}
                  </MeedStatusTag>
                ))}
              </HStack>
            </VStack>
          </GridItem>
          <GridItem>
            <VStack alignItems="stretch" gap="s">
              <HStack gap="xs" alignItems="center">
                <Icon as={LuSparkles} boxSize="14px" color="content.link" />
                <Overline color="content.tertiary">
                  {t("summary-insights-title")}
                </Overline>
              </HStack>
              <VStack alignItems="stretch" gap="s">
                {lines.map((line, i) => (
                  <HStack key={i} alignItems="flex-start" gap="s">
                    <Icon
                      as={line.icon}
                      boxSize="16px"
                      color="content.link"
                      mt="xs"
                      flexShrink={0}
                    />
                    <BodyMedium color="content.primary">{line.text}</BodyMedium>
                  </HStack>
                ))}
              </VStack>
            </VStack>
          </GridItem>
        </Grid>
        {config && (
          <Box mt="l" pt="l" borderTopWidth="1px" borderColor="border.overlay">
            {config}
          </Box>
        )}
      </Card.Body>
    </Card.Root>
  );
}
