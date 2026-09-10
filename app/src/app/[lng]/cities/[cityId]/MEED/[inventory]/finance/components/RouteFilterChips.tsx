"use client";
import { chakra, HStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { FOCUS_RING, ROUTE_META, ROUTE_ORDER, type RouteKey } from "../labels";

const Pill = chakra("button", {
  base: {
    px: "14px",
    py: "7px",
    borderRadius: "pill",
    borderWidth: "1px",
    cursor: "pointer",
    fontFamily: "heading",
    fontSize: "label.md",
    fontWeight: "medium",
    lineHeight: "16px",
    whiteSpace: "nowrap",
    transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
    _focusVisible: FOCUS_RING,
  },
});

const SELECTED = {
  bg: "content.link",
  borderColor: "content.link",
  color: "base.light",
} as const;

const UNSELECTED = {
  bg: "base.light",
  borderColor: "border.neutral",
  color: "content.secondary",
  _hover: { borderColor: "content.link", color: "content.link" },
} as const;

export interface RouteFilterChipsProps {
  /** null ⇒ no filter, i.e. "All". */
  active: RouteKey | null;
  onChange: (next: RouteKey | null) => void;
  counts: Partial<Record<RouteKey, number>>;
  totalCount: number;
  /** id of the table the filter drives. */
  controls: string;
  ariaLabel: string;
  t: TFunction;
}

/**
 * Financing-route filter.
 *
 * Plain pressable pills rather than the primary-action button component with
 * height and min-width overrides: these are filters, not calls to action, and
 * `aria-pressed` reports the selection that colour alone used to carry.
 */
export function RouteFilterChips({
  active,
  onChange,
  counts,
  totalCount,
  controls,
  ariaLabel,
  t,
}: RouteFilterChipsProps) {
  return (
    <HStack gap="s" flexWrap="wrap" role="group" aria-label={ariaLabel}>
      <Pill
        type="button"
        aria-pressed={active === null}
        aria-controls={controls}
        onClick={() => onChange(null)}
        {...(active === null ? SELECTED : UNSELECTED)}
      >
        {t("filter-all", { n: totalCount })}
      </Pill>
      {ROUTE_ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => {
        const selected = active === key;
        return (
          <Pill
            key={key}
            type="button"
            aria-pressed={selected}
            aria-controls={controls}
            onClick={() => onChange(selected ? null : key)}
            {...(selected ? SELECTED : UNSELECTED)}
          >
            {`${t(ROUTE_META[key].labelKey)} · ${counts[key]}`}
          </Pill>
        );
      })}
    </HStack>
  );
}
