"use client";
import React from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { Overline } from "@/components/package/Texts/Overline";
import type { useLabels } from "../../_lib/useLabels";
import { ADAPTA_SECTORS, RISK_CELLS } from "../../_lib/riskCells";
import { CO_BENEFIT_KEYS } from "../../_lib/coBenefits";
import { pick } from "../../_lib/localized";
import { TextLink } from "./TextLink";
import { FacetMenu, FilterChip } from "./ListControls";
import {
  EMPTY_FILTERS,
  FACET_KEYS,
  FACETS_ADDRESSES,
  FACETS_TAKES,
  facetCount,
  LEVEL_TONE,
  type FacetKey,
  type RankedRow,
  type RowFilters,
} from "./rows";

interface Option {
  value: string;
  label: string;
}

/**
 * The list's filters, after the Booking-style pattern the review asked for:
 * eight facets in two groups (what the action addresses, what it takes),
 * live counts per option, options that would empty the list disabled, and
 * the active filters as removable chips. Filters never change a score.
 */
export function FilterBar({
  rows,
  filters,
  onChange,
  lng,
  t,
  labels,
}: {
  /** All ranked rows; the counts are computed over them. */
  rows: RankedRow[];
  filters: RowFilters;
  onChange: (next: RowFilters) => void;
  lng: string;
  t: TFunction;
  labels: ReturnType<typeof useLabels>;
}) {
  const facets: Record<FacetKey, { title: string; options: Option[] }> = {
    sector: {
      title: t("next-filter-sectors"),
      options: ADAPTA_SECTORS.map((k) => ({
        value: k,
        label: labels.sector(k),
      })),
    },
    hazard: {
      title: t("next-filter-hazards"),
      options: RISK_CELLS.map((c) => ({
        value: c.key,
        label: pick(c.label, lng),
      })),
    },
    level: {
      title: t("next-filter-level"),
      options: [
        { value: "high", label: t("risk-level-negative") },
        { value: "medium", label: t("risk-level-warning") },
        { value: "low", label: t("risk-level-positive") },
      ],
    },
    benefit: {
      title: t("next-filter-cobenefits"),
      options: CO_BENEFIT_KEYS.map((k) => ({
        value: k,
        label: labels.coBenefit(k),
      })),
    },
    cost: {
      title: t("next-filter-cost"),
      options: ["low", "medium", "high"].map((k) => ({
        value: k,
        label: t(`next-cost-${k}`),
      })),
    },
    legal: {
      title: t("next-filter-legal"),
      options: ["feasible", "adjustments", "heavy"].map((k) => ({
        value: k,
        label: t(`next-legal-bin-${k}`),
      })),
    },
    funding: {
      title: t("next-filter-funding"),
      options: ["self", "support", "both"].map((k) => ({
        value: k,
        label: t(`next-funding-bin-${k}`),
      })),
    },
    timeline: {
      title: t("next-filter-timeline"),
      options: ["<5 years", "5-10 years", ">10 years"].map((k) => ({
        value: k,
        label: labels.timeline(k),
      })),
    },
  };

  const groups: { title: string; keys: FacetKey[] }[] = [
    { title: t("next-filter-group-addresses"), keys: FACETS_ADDRESSES },
    { title: t("next-filter-group-takes"), keys: FACETS_TAKES },
  ];
  // A chip names its dimension once: "High risk", "Low cost", a sector or
  // hazard by its own name, the rest as "Legal capacity: Feasible".
  const chipLabel = (key: FacetKey, value: string, label: string) => {
    if (key === "level") return t(`next-risk-level-${LEVEL_TONE[value]}`);
    if (
      key === "cost" ||
      key === "sector" ||
      key === "hazard" ||
      key === "benefit"
    )
      return label;
    return `${facets[key].title}: ${label}`;
  };
  const active = FACET_KEYS.flatMap((k) =>
    filters[k].map((v) => ({
      key: k,
      value: v,
      label: facets[k].options.find((o) => o.value === v)?.label ?? v,
    })),
  );

  return (
    <VStack alignItems="stretch" gap="m">
      {groups.map((g) => (
        <HStack key={g.title} gap="s" flexWrap="wrap" alignItems="center">
          <Box w={{ base: "full", md: "150px" }} flexShrink={0}>
            <Overline color="content.tertiary">{g.title}</Overline>
          </Box>
          {g.keys.map((k) => (
            <FacetMenu
              key={k}
              label={facets[k].title}
              options={facets[k].options}
              counts={facets[k].options.map((o) =>
                facetCount(rows, filters, k, o.value),
              )}
              selected={filters[k]}
              onChange={(next) => onChange({ ...filters, [k]: next })}
            />
          ))}
        </HStack>
      ))}
      {active.length > 0 && (
        <HStack gap="s" flexWrap="wrap" alignItems="center">
          {active.map((a) => (
            <FilterChip
              key={`${a.key}-${a.value}`}
              label={chipLabel(a.key, a.value, a.label)}
              ariaLabel={t("next-filter-remove", {
                facet: facets[a.key].title,
                value: a.label,
              })}
              onRemove={() =>
                onChange({
                  ...filters,
                  [a.key]: filters[a.key].filter((v) => v !== a.value),
                })
              }
            />
          ))}
          <TextLink arrow={false} muted onClick={() => onChange(EMPTY_FILTERS)}>
            {t("next-filters-clear")}
          </TextLink>
        </HStack>
      )}
    </VStack>
  );
}
