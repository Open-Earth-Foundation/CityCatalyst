"use client";
import React, { useMemo } from "react";
import type { TFunction } from "i18next";
import {
  LuClipboardList,
  LuFactory,
  LuScale,
  LuShieldAlert,
  LuUsers,
  LuWallet,
} from "react-icons/lu";
import type {
  MeedContextArea,
  MeedContextFacts,
  MeedContextStat,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/contextAreas";
import type { MeedPolicyBacking } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/rankingFacts";
import type { MeedContextCta } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ContextCardGrid";
import { MeedFunnelStrip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedFunnelStrip";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import { MeedShareBar } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedShareBar";
import { sectorShares } from "@/app/[lng]/cities/[cityId]/MEED/components/sectorShares";
import { SECTORS } from "@/util/constants";
import type { SectorEmission } from "@/util/types";
import type { TrackData } from "../_lib/useTrack";
import { trackHref } from "../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../_lib/actions";
import { creditScreen, CREDIT_LABEL, fundingResult } from "../_lib/finance";
import { legalGrade } from "../_lib/legal";
import { pick } from "../_lib/localized";
import { RISK_CELLS } from "../_lib/riskCells";
import { useDemoT } from "../_lib/useDemoT";
import { RiskProfileStrip } from "./RiskCellGrid";

/**
 * The "how the ranking works" cards for each track. Adaptation swaps the
 * emissions card for the risk profile and drops socioeconomic context to a
 * "shown, not scored" card; everything else keeps its place so the two tracks
 * read as one module.
 */
export function useContextAreas({
  lng,
  data,
  tResults,
}: {
  lng: string;
  data: TrackData;
  tResults: TFunction;
}) {
  const { city, track, ranked, adaptation, state } = data;
  const { t } = useDemoT(lng);

  const areas: MeedContextArea[] = useMemo(
    () =>
      track === "adaptation"
        ? [
            {
              key: "risk",
              segment: "risk",
              titleKey: "area-risk-title",
              descriptionKey: "area-risk-desc",
              icon: LuShieldAlert,
              wide: true,
            },
            {
              key: "context-br",
              segment: "context",
              titleKey: "area-context-title",
              descriptionKey: "area-context-desc",
              icon: LuUsers,
              wide: true,
            },
            {
              key: "legal-br",
              segment: "legal",
              titleKey: "area-legal-title",
              descriptionKey: "area-legal-desc",
              icon: LuScale,
            },
            {
              key: "finance-br",
              segment: "finance",
              titleKey: "area-finance-title",
              descriptionKey: "area-finance-desc",
              icon: LuWallet,
            },
            {
              key: "policy-br",
              segment: "policy",
              titleKey: "area-policy-title",
              descriptionKey: "area-policy-desc",
              icon: LuClipboardList,
            },
          ]
        : [
            {
              key: "emissions",
              segment: "emissions",
              titleKey: "context-emissions",
              descriptionKey: "context-desc-emissions",
              icon: LuFactory,
            },
            {
              key: "context-br",
              segment: "context",
              titleKey: "area-context-mitigation-title",
              descriptionKey: "area-context-desc",
              icon: LuUsers,
              wide: true,
            },
            {
              key: "legal-br",
              segment: "legal",
              titleKey: "area-legal-title",
              descriptionKey: "area-legal-desc",
              icon: LuScale,
            },
            {
              key: "finance-br",
              segment: "finance",
              titleKey: "area-finance-title",
              descriptionKey: "area-finance-desc",
              icon: LuWallet,
            },
            {
              key: "policy-br",
              segment: "policy",
              titleKey: "area-policy-title",
              descriptionKey: "area-policy-desc",
              icon: LuClipboardList,
            },
          ],
    [track],
  );

  const hasRanking = Boolean(state.generatedAt);
  const emissionsTotal = Object.values(city.inventory.bySector).reduce(
    (s, v) => s + v,
    0,
  );

  const legal = useMemo(() => {
    const total = ADAPTATION_ACTIONS.length;
    const feasible = ADAPTATION_ACTIONS.filter(
      (a) => a.legal.score >= 4,
    ).length;
    const blocked = ADAPTATION_ACTIONS.filter(
      (a) => legalGrade(a.legal.score) === "not_feasible",
    ).length;
    return { total, feasible, blocked };
  }, []);

  const finance = useMemo(() => {
    const results = ADAPTATION_ACTIONS.filter((a) => a.kind === "direct").map(
      (a) => fundingResult(a, city),
    );
    return {
      total: results.length,
      self: results.filter(
        (r) => r.gap === "self_deliverable" || r.gap === "credit_available",
      ).length,
      ta: results.filter((r) => r.gap === "needs_technical_assistance").length,
      cofinance: results.filter(
        (r) =>
          r.gap === "needs_cofinance" || r.gap === "needs_cofinance_and_ta",
      ).length,
    };
  }, [city]);

  const policy = useMemo(() => {
    const scores = ADAPTATION_ACTIONS.map((a) => a.policy.score);
    return {
      mean: scores.reduce((s, v) => s + v, 0) / scores.length / 100,
      strong: scores.filter((s) => s >= 66).length,
    };
  }, []);

  // The card summary line reads `states[key].sub`; the demo writes one per area.
  const states = useMemo(() => {
    const sub = (key: string, text: string) => ({
      key,
      status: "complete" as const,
      sub: text,
    });
    const topCell = RISK_CELLS.map((c) => ({
      c,
      v: city.risk[c.key]?.index ?? -1,
    })).sort((a, b) => b.v - a.v)[0];
    return {
      risk: sub(
        "risk",
        t("area-risk-sub", {
          cell: pick(topCell.c.label, lng),
          value: topCell.v.toFixed(2),
        }),
      ),
      emissions: sub(
        "emissions",
        tResults("context-summary-emissions-year", {
          value: `${(emissionsTotal / 1000).toFixed(1)} ktCO2e`,
          year: city.inventory.year,
        }),
      ),
      "legal-br": sub(
        "legal-br",
        hasRanking
          ? t("area-legal-sub", {
              feasible: legal.feasible,
              total: legal.total,
              blocked: legal.blocked,
            })
          : t("area-legal-sub-pending"),
      ),
      "finance-br": sub(
        "finance-br",
        t("area-finance-sub", {
          credit: pick(CREDIT_LABEL[creditScreen(city.capag)], lng),
          self: finance.self,
          total: finance.total,
        }),
      ),
      "policy-br": sub(
        "policy-br",
        t("area-policy-sub", {
          strong: policy.strong,
          total: ADAPTATION_ACTIONS.length,
        }),
      ),
      "context-br": sub("context-br", t("area-context-sub")),
    };
  }, [
    city,
    lng,
    t,
    tResults,
    emissionsTotal,
    hasRanking,
    legal,
    finance,
    policy,
  ]);

  const facts: MeedContextFacts = useMemo(
    () => ({
      rankedCount: ranked.length,
      excludedCount: adaptation ? adaptation.notRanked.length : null,
      strongPolicyBacking: policy.strong,
      states,
      hasRanking,
      emissionsText: `${(emissionsTotal / 1000).toFixed(1)} ktCO2e`,
      inventoryYear: city.inventory.year,
      sectorsWithData: Object.values(city.inventory.bySector).filter(
        (v) => v > 0,
      ).length,
    }),
    [
      ranked.length,
      adaptation,
      policy.strong,
      states,
      hasRanking,
      emissionsTotal,
      city.inventory,
    ],
  );

  const backing: MeedPolicyBacking = useMemo(
    () => ({
      strong: policy.strong,
      moderate: ADAPTATION_ACTIONS.filter(
        (a) => a.policy.score >= 33 && a.policy.score < 66,
      ).length,
      average: policy.mean,
    }),
    [policy.strong, policy.mean],
  );

  const indicatorFor = (
    area: MeedContextArea,
  ): MeedContextStat | null | undefined => {
    switch (area.key) {
      case "risk": {
        const cells = RISK_CELLS.filter((c) => city.risk[c.key]).length;
        return {
          label: t("stat-risk-cells"),
          value: String(cells),
          sub: t("stat-risk-cells-sub", { total: RISK_CELLS.length }),
        };
      }
      case "legal-br":
        return hasRanking
          ? {
              label: t("stat-legal-feasible"),
              value: String(legal.feasible),
              sub: t("stat-legal-feasible-sub", { total: legal.total }),
              tone: "positive",
            }
          : {
              label: t("stat-legal-bank"),
              value: String(legal.total),
              sub: t("stat-legal-bank-sub"),
            };
      case "finance-br":
        return {
          label: t("stat-finance-self"),
          value: String(finance.self),
          sub: t("stat-finance-self-sub", { total: finance.total }),
          tone: "positive",
        };
      case "policy-br":
        return {
          label: t("stat-policy-strong"),
          value: String(policy.strong),
          sub: t("stat-policy-strong-sub", {
            total: ADAPTATION_ACTIONS.length,
          }),
        };
      case "context-br":
        return {
          label: t("stat-context-shown"),
          value: t("stat-context-not-scored"),
        };
      default:
        return undefined;
    }
  };

  const visualFor = (area: MeedContextArea): React.ReactNode => {
    switch (area.key) {
      case "risk":
        return <RiskProfileStrip city={city} lng={lng} t={t} />;
      case "emissions": {
        const bySector: SectorEmission[] = SECTORS.map((s) => ({
          sectorName: s.name,
          co2eq: BigInt(
            Math.round((city.inventory.bySector[s.name] ?? 0) * 1000),
          ),
          percentage: 0,
        }));
        const shares = sectorShares(bySector);
        return shares.length ? (
          <MeedShareBar
            segments={shares.map((s) => ({
              label: tResults(`sector-short-${s.name}`),
              value: s.share,
              color: `sectors.${s.referenceNumber}`,
            }))}
            ariaLabel={tResults("sector-share-tip-title")}
            tipTitle={tResults("sector-share-tip-title")}
            tipNote={tResults("sector-share-tip-note")}
            t={tResults}
          />
        ) : undefined;
      }
      case "legal-br":
        return (
          <MeedFunnelStrip
            compact
            steps={[
              { label: t("funnel-bank"), value: legal.total, tone: "neutral" },
              {
                label: t("funnel-legal"),
                value: legal.total - legal.blocked,
                tone: "info",
              },
              {
                label: t("funnel-ranked"),
                value: hasRanking ? ranked.length : 0,
                tone: "positive",
              },
            ]}
            ariaLabel={t("funnel-aria")}
          />
        );
      case "finance-br":
        return (
          <MeedShareBar
            segments={[
              {
                label: t("gap-short-self"),
                value: finance.self,
                color: "interactive.tertiary",
              },
              {
                label: t("gap-short-ta"),
                value: finance.ta,
                color: "sentiment.warningDefault",
              },
              {
                label: t("gap-short-cofinance"),
                value: finance.cofinance,
                color: "content.tertiary",
              },
            ]}
            ariaLabel={t("area-finance-title")}
            tipTitle={t("area-finance-title")}
            t={tResults}
          />
        );
      case "policy-br":
        return (
          <MeedMeter
            value={policy.mean}
            tone={
              policy.mean >= 0.66
                ? "positive"
                : policy.mean >= 0.33
                  ? "warning"
                  : "neutral"
            }
            label={t("stat-policy-mean")}
            valueText={Math.round(policy.mean * 100).toString()}
          />
        );
      default:
        return undefined;
    }
  };

  const hrefFor = (segment: string) =>
    trackHref(lng, city.slug, track, segment);

  // City context is inside the AdaptaBrasil Impact index already, so the
  // card's action says so instead of inviting the reader to "view details".
  const ctaFor = (area: MeedContextArea): MeedContextCta | undefined =>
    area.key === "context-br" && track === "adaptation"
      ? { label: t("area-context-cta"), href: hrefFor("context") }
      : undefined;

  return { areas, facts, backing, visualFor, indicatorFor, ctaFor, hrefFor };
}
