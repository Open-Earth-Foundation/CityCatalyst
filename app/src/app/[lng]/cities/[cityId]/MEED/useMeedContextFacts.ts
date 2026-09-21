"use client";
import { useMemo } from "react";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetMeedCityAttributesQuery,
  useGetMeedFinanceFeasibilityQuery,
  useGetMeedPolicyScoresQuery,
} from "@/services/api";
import type { SectorEmission } from "@/util/types";
import { countSectorsWithData } from "./meedEmissions";
import {
  buildIndicators,
  extractIndicatorFields,
  formatIndicatorValue,
  KEY_INDICATOR_KEYS,
  type MeedIndicator,
} from "./[inventory]/context/indicators";
import { extractFeasibilityRows } from "./[inventory]/finance/types";
import {
  financeFacts,
  type MeedFinanceFacts,
} from "./[inventory]/finance/financeFacts";
import { profileAttrs } from "./[inventory]/finance/labels";
import { extractScores } from "./[inventory]/policy/policyRows";
import {
  computePolicyAggregates,
  type PolicyAggregates,
} from "./[inventory]/policy/policyAggregates";

/** One headline indicator, already formatted for display. */
export interface MeedKeyIndicator {
  key: string;
  label: string;
  valueText: string;
  category: MeedIndicator["category"];
}

export interface MeedContextData {
  bySector: SectorEmission[] | undefined;
  sectorsWithData: number | null;
  indicatorCount: number | null;
  /** The few indicators worth naming on a card, in display order. */
  keyIndicators: MeedKeyIndicator[];
  finance: MeedFinanceFacts | null;
  /** action_id → raw financing route, for per-action questions. */
  financeRoutes: Map<string, string | null | undefined>;
  /** Translated financial profile of the city, e.g. "Self-sufficient city". */
  cityProfileLabel: string | null;
  policy: PolicyAggregates | null;
}

/**
 * The headline numbers behind the "How the ranking works" cards and the
 * ranking summary, read once for the module home and the results page so
 * both quote the same figures.
 *
 * Everything here is the same RTK query the detail pages use, so opening a
 * card afterwards costs nothing extra; the counting is the same helper each
 * page runs, so a card and its page can never disagree.
 */
export function useMeedContextFacts({
  lng,
  cityId,
  inventoryId,
  includeEmissions,
}: {
  lng: string;
  cityId: string;
  inventoryId: string;
  /** False until emissions have been retrieved; the results query is skipped. */
  includeEmissions: boolean;
}): MeedContextData {
  const { t: tContext } = useTranslation(lng, "meed-context");
  const { t: tFinance } = useTranslation(lng, "meed-finance");

  const { data: results } = api.useGetResultsQuery(inventoryId, {
    skip: !inventoryId || !includeEmissions,
  });
  const { data: attributes } = useGetMeedCityAttributesQuery(
    { cityId },
    { skip: !cityId },
  );
  const { data: finance } = useGetMeedFinanceFeasibilityQuery(
    { cityId },
    { skip: !cityId },
  );
  const { data: policy } = useGetMeedPolicyScoresQuery(
    { cityId },
    { skip: !cityId },
  );

  const indicators = useMemo(() => {
    if (!attributes) return null;
    const fields = extractIndicatorFields(attributes);
    return fields ? buildIndicators(fields, tContext) : [];
  }, [attributes, tContext]);

  const keyIndicators = useMemo<MeedKeyIndicator[]>(() => {
    if (!indicators) return [];
    return KEY_INDICATOR_KEYS.map((key) =>
      indicators.find((i) => i.key === key),
    )
      .filter((i): i is MeedIndicator => Boolean(i))
      .slice(0, 3)
      .map((i) => ({
        key: i.key,
        label: i.label,
        valueText: formatIndicatorValue(i, tContext),
        category: i.category,
      }));
  }, [indicators, tContext]);

  const financeRows = useMemo(
    () => (finance ? extractFeasibilityRows(finance) : []),
    [finance],
  );
  const financeData = useMemo(
    () => (finance ? financeFacts(financeRows) : null),
    [finance, financeRows],
  );
  const financeRoutes = useMemo(
    () => new Map(financeRows.map((r) => [r.action_id, r.route])),
    [financeRows],
  );
  const cityProfileLabel = useMemo(() => {
    if (!financeRows.length) return null;
    return tFinance(
      profileAttrs(financeRows[0]?.inputs?.city?.profile).labelKey,
    );
  }, [financeRows, tFinance]);

  const policyData = useMemo(
    () => (policy ? computePolicyAggregates(extractScores(policy)) : null),
    [policy],
  );

  return {
    bySector: results?.totalEmissions?.bySector,
    sectorsWithData: results ? countSectorsWithData(results) : null,
    indicatorCount: indicators ? indicators.length : null,
    keyIndicators,
    finance: financeData,
    financeRoutes,
    cityProfileLabel,
    policy: policyData,
  };
}
