"use client";
import React from "react";
import { HStack, Icon, VStack } from "@chakra-ui/react";
import {
  LuChartColumn,
  LuClipboardList,
  LuClock,
  LuCoins,
  LuFactory,
  LuLightbulb,
  LuScale,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import type { IconType } from "react-icons";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import type { MeedRankingInsights } from "../[inventory]/results/components/rankingInsights";
import type { MeedPolicyBacking } from "../[inventory]/results/components/rankingFacts";
import type { MeedLegalCategory } from "../[inventory]/regulations/legalStanding";

export interface MeedInsightListProps {
  insights: MeedRankingInsights;
  /** Ranked actions per municipal-authority category; null when the ranking carries no legal data. */
  legalCounts: Record<MeedLegalCategory, number> | null;
  backing: MeedPolicyBacking;
  nationalPolicy: number | null;
  /** Catalog sector tag → label. */
  sectorLabelFor: (tag: string) => string;
  /** Inventory sector name (e.g. "transportation") → label. */
  inventorySectorLabelFor: (name: string) => string;
  /** `meed-results` namespace. */
  t: TFunction;
  /** Show the "Key insights" eyebrow above the lines. */
  eyebrow?: boolean;
}

const PILLAR_KEY = {
  impact: "composition-impact",
  alignment: "composition-alignment",
  feasibility: "composition-feasibility",
} as const;

/** The sentences, derived only from the ranking and the context queries. */
export function rankingInsightLines({
  insights,
  legalCounts,
  backing,
  nationalPolicy,
  sectorLabelFor,
  inventorySectorLabelFor,
  t,
}: Omit<MeedInsightListProps, "eyebrow">): { icon: IconType; text: string }[] {
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

  if (
    legalCounts &&
    legalCounts.blocked + legalCounts.conditional + legalCounts.enabled > 0
  ) {
    const key =
      legalCounts.blocked > 0
        ? "insight-legal"
        : legalCounts.conditional > 0
          ? "insight-legal-conditional"
          : "insight-legal-all-enabled";
    lines.push({ icon: LuScale, text: t(key, legalCounts) });
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

  return lines;
}

/**
 * What came out of the ranking, in a handful of sentences with numbers. Every
 * line is derived, nothing is generated, so it is exactly as true as the
 * cards it sits above.
 */
export function MeedInsightList({
  eyebrow = true,
  ...props
}: MeedInsightListProps) {
  const lines = rankingInsightLines(props);
  const { t } = props;
  return (
    <VStack alignItems="stretch" gap="s">
      {eyebrow && (
        <HStack gap="xs" alignItems="center">
          <Icon as={LuLightbulb} boxSize="14px" color="content.link" />
          <Overline color="content.tertiary">
            {t("summary-insights-title")}
          </Overline>
        </HStack>
      )}
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
  );
}
