"use client";
import React from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { Overline } from "@/components/package/Texts/Overline";
import { BodySmall } from "@/components/package/Texts/Body";
import type { useLabels } from "../../_lib/useLabels";
import { ADAPTA_SECTORS, RISK_CELLS } from "../../_lib/riskCells";
import { CO_BENEFIT_KEYS } from "../../_lib/coBenefits";
import { pick } from "../../_lib/localized";
import { TextLink } from "./TextLink";
import { FacetMenu, FilterChip, ShortcutChip } from "./ListControls";
import {
  EMPTY_FILTERS,
  FACET_KEYS,
  FACETS_ADDRESSES,
  FACETS_TAKES,
  facetCount,
  LEVEL_TONE,
  PRIORITY_SHORTCUTS,
  type FacetKey,
  type RankedRow,
  type RowFilters,
} from "./rows";

interface Option {
  value: string;
  label: string;
}

/** A labelled row of the controls: the label column, then the controls. */
function ControlRow({
  label,
  testId,
  children,
}: {
  label: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <HStack
      gap="s"
      flexWrap="wrap"
      alignItems="center"
      data-testid={testId}
    >
      <Box
        w={{ base: "full", md: "140px" }}
        flexShrink={0}
        display={{ base: label ? "block" : "none", md: "block" }}
      >
        <Overline color="content.tertiary">{label}</Overline>
      </Box>
      {children}
    </HStack>
  );
}

/**
 * The one controls cluster at the head of the list (review round 2: keep
 * filters and preferences together): one-click shortcuts for what a city
 * looks for first; the eight filters, with live counts and dead ends
 * disabled; and, on its own row, the preferences that change the order.
 * One line says the difference: filters narrow, preferences re-order.
 */
export function FilterBar({
  rows,
  filters,
  onChange,
  lng,
  t,
  labels,
  orderControls,
}: {
  /** The "change the order" row: the preferences button and what the order uses. */
  orderControls?: React.ReactNode;
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
  const isShortcut = (key: FacetKey, value: string) =>
    PRIORITY_SHORTCUTS.some((s) => s.key === key && s.value === value);
  const toggle = (key: FacetKey, value: string) =>
    onChange({
      ...filters,
      [key]: filters[key].includes(value)
        ? filters[key].filter((v) => v !== value)
        : [...filters[key], value],
    });
  // A pressed shortcut is its own chip; it is not repeated below.
  const active = FACET_KEYS.flatMap((k) =>
    filters[k]
      .filter((v) => !isShortcut(k, v))
      .map((v) => ({
        key: k,
        value: v,
        label: facets[k].options.find((o) => o.value === v)?.label ?? v,
      })),
  );
  const anyActive = FACET_KEYS.some((k) => filters[k].length > 0);

  return (
    <VStack alignItems="stretch" gap="m">
      <BodySmall color="content.secondary">{t("next-controls-hint")}</BodySmall>
      <ControlRow label={t("next-shortcuts-title")} testId="priority-shortcuts">
        {PRIORITY_SHORTCUTS.map((s) => (
          <ShortcutChip
            key={s.id}
            label={t(`next-shortcut-${s.id}`)}
            count={facetCount(rows, filters, s.key, s.value)}
            pressed={filters[s.key].includes(s.value)}
            onToggle={() => toggle(s.key, s.value)}
          />
        ))}
      </ControlRow>
      {/* Two lines of four, so neither wraps: what the action addresses,
          then what it takes. The second line continues the first. */}
      <VStack alignItems="stretch" gap="s">
        {[FACETS_ADDRESSES, FACETS_TAKES].map((keys, i) => (
          <ControlRow
            key={keys.join()}
            label={i === 0 ? t("next-filter-row") : ""}
          >
            {keys.map((k) => (
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
          </ControlRow>
        ))}
      </VStack>
      {anyActive && (
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
      {orderControls && (
        <Box pt="m" borderTopWidth="1px" borderColor="border.overlay">
          <ControlRow label={t("next-order-row")}>{orderControls}</ControlRow>
        </Box>
      )}
    </VStack>
  );
}
