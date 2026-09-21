"use client";
import React from "react";
import { HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { SectorEmission } from "@/util/types";
import { BodyMedium } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import type { MeedContextArea } from "../[inventory]/results/components/contextAreas";
import type { MeedLegalFunnel } from "../[inventory]/results/components/rankingFacts";
import type { MeedFinanceFacts } from "../[inventory]/finance/financeFacts";
import type { PolicyAggregates } from "../[inventory]/policy/policyAggregates";
import { scoreTone } from "../[inventory]/policy/policyRows";
import {
  CATEGORY_TONE,
  categoryLabelKey,
} from "../[inventory]/context/indicators";
import type { MeedKeyIndicator } from "../useMeedContextFacts";
import { MeedFunnelStrip } from "./MeedFunnelStrip";
import { MeedMeter } from "./MeedMeter";
import { MeedShareBar } from "./MeedShareBar";
import { MeedStatusTag } from "./MeedStatusTag";
import { sectorShares } from "./sectorShares";

export interface MeedContextVisualInputs {
  bySector?: SectorEmission[];
  /** Only draw the sector bar once emissions are retrieved with data. */
  showEmissions: boolean;
  keyIndicators?: MeedKeyIndicator[];
  funnel?: MeedLegalFunnel | null;
  finance?: MeedFinanceFacts | null;
  policy?: PolicyAggregates | null;
  /** `meed-results` namespace. */
  t: TFunction;
  /** `meed-context` namespace, for indicator level labels. */
  tContext: TFunction;
  /** Short sector label, e.g. "IPPU". */
  sectorLabelFor: (sectorName: string) => string;
}

/**
 * The visual each "How the ranking works" card carries, shared by the module
 * home and the results page so the two never draw the same area differently.
 * Every visual is static (the card is the link) and explains itself on hover.
 * Returns `undefined` when an area has nothing worth drawing.
 */
export function meedContextVisual(
  area: MeedContextArea,
  inputs: MeedContextVisualInputs,
): React.ReactNode {
  const {
    bySector,
    showEmissions,
    keyIndicators,
    funnel,
    finance,
    policy,
    t,
    tContext,
    sectorLabelFor,
  } = inputs;

  switch (area.key) {
    case "emissions": {
      const shares = showEmissions ? sectorShares(bySector) : [];
      return shares.length ? (
        <MeedShareBar
          segments={shares.map((s) => ({
            label: sectorLabelFor(s.name),
            value: s.share,
            color: `sectors.${s.referenceNumber}`,
          }))}
          ariaLabel={t("sector-share-tip-title")}
          tipTitle={t("sector-share-tip-title")}
          tipNote={t("sector-share-tip-note")}
          t={t}
        />
      ) : undefined;
    }

    case "context":
      return keyIndicators?.length ? (
        <VStack alignItems="stretch" gap="xs">
          {keyIndicators.map((ind) => (
            <HStack key={ind.key} justifyContent="space-between" gap="m">
              <BodyMedium color="content.secondary" lineClamp={1}>
                {ind.label}
              </BodyMedium>
              <HStack gap="s" flexShrink={0} alignItems="center">
                <LabelMedium
                  color="content.primary"
                  fontVariantNumeric="tabular-nums"
                >
                  {ind.valueText}
                </LabelMedium>
                <MeedStatusTag tone={CATEGORY_TONE[ind.category]}>
                  {tContext(categoryLabelKey(ind.category))}
                </MeedStatusTag>
              </HStack>
            </HStack>
          ))}
        </VStack>
      ) : undefined;

    case "regulations":
      return funnel ? (
        <MeedFunnelStrip
          showSublabels={false}
          steps={[
            {
              label: t("stat-assessed"),
              sublabel: t("stat-assessed-sub"),
              value: funnel.assessed,
              tone: "neutral",
            },
            {
              label: t("stat-passed"),
              sublabel: t("stat-passed-sub"),
              value: funnel.passed,
              tone: "positive",
            },
            {
              label: t("stat-ranked-legal"),
              sublabel: t("stat-ranked-legal-sub"),
              value: funnel.ranked,
              tone: "info",
            },
          ]}
          ariaLabel={t("funnel-aria", { ...funnel })}
          tipTitle={t("funnel-tip-title")}
          tipNote={t("funnel-tip-note")}
        />
      ) : undefined;

    case "finance":
      return finance && finance.total > 0 ? (
        <MeedShareBar
          segments={[
            {
              label: t("route-self"),
              value: finance.self,
              color: "interactive.tertiary",
            },
            {
              label: t("route-cofinance"),
              value: finance.cofinance,
              color: "sentiment.warningDefault",
            },
            {
              label: t("route-support"),
              value: finance.support,
              color: "sentiment.negativeDefault",
            },
            {
              label: t("route-other"),
              value: finance.other,
              color: "content.tertiary",
            },
          ]}
          formatValue={(s) => String(s.value)}
          ariaLabel={t("route-tip-title")}
          tipTitle={t("route-tip-title")}
          tipNote={t("route-tip-note")}
          t={t}
        />
      ) : undefined;

    case "policy":
      return policy ? (
        <VStack alignItems="stretch" gap="s">
          {(
            [
              ["national", t("policy-scope-national")],
              ["regional", t("policy-scope-regional")],
              ["municipal", t("policy-scope-municipal")],
            ] as const
          ).map(([scope, label]) => {
            const value = policy[scope];
            const valueText =
              value === null
                ? t("policy-scope-none")
                : t("percent-value", { value: Math.round(value * 100) });
            return (
              <MeedMeter
                key={scope}
                value={value ?? 0}
                tone={value === null ? "neutral" : scoreTone(value)}
                label={label}
                valueText={valueText}
                height="6px"
                ariaLabel={t("legend-item", { label, value: valueText })}
              />
            );
          })}
        </VStack>
      ) : undefined;

    default:
      return undefined;
  }
}
