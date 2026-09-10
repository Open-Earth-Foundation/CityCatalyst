/**
 * The six "what went into this ranking" areas, in one place.
 *
 * Both the compact grid on the results overview and the context-breakdown tab
 * read this list, so the two views can never drift apart on wording, icons or
 * ordering. Five of them deep-link back to the wizard step that owns the data;
 * the sixth points at the full ranking table further down the same page.
 */
import type { IconType } from "react-icons";
import {
  LuChartColumn,
  LuClipboardList,
  LuFactory,
  LuScale,
  LuUsers,
  LuWallet,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedSectionStates } from "../../../meedStatus";
import { MEED_OUTPUT_AREAS } from "../../../steps";
import type { MeedPolicyBacking } from "./rankingFacts";

export interface MeedContextArea {
  key: string;
  /** Wizard step segment to deep-link to; absent for the full-ranking card. */
  segment?: string;
  titleKey: string;
  descriptionKey: string;
  icon: IconType;
}

export const MEED_CONTEXT_AREAS: MeedContextArea[] = [
  {
    key: "emissions",
    segment: "emissions",
    titleKey: "context-emissions",
    descriptionKey: "context-desc-emissions",
    icon: LuFactory,
  },
  {
    key: "context",
    segment: "context",
    titleKey: "context-socioeconomic",
    descriptionKey: "context-desc-socioeconomic",
    icon: LuUsers,
  },
  {
    key: "regulations",
    segment: "regulations",
    titleKey: "context-legal",
    descriptionKey: "context-desc-legal",
    icon: LuScale,
  },
  {
    key: "finance",
    segment: "finance",
    titleKey: "context-financial",
    descriptionKey: "context-desc-financial",
    icon: LuWallet,
  },
  {
    key: "policy",
    segment: "policy",
    titleKey: "context-policy",
    descriptionKey: "context-desc-policy",
    icon: LuClipboardList,
  },
  {
    key: "ranking",
    titleKey: "context-ranking",
    descriptionKey: "context-desc-ranking",
    icon: LuChartColumn,
  },
];

/** Everything the summary lines can quote, gathered once by the page. */
export interface MeedContextFacts {
  /** Formatted total city emissions, e.g. "1.1 MtCO2e". */
  emissionsText?: string;
  inventoryYear?: number;
  rankedCount: number;
  excludedCount: number | null;
  strongPolicyBacking: number;
  states: MeedSectionStates;
}

/**
 * One live line per area.
 *
 * Areas whose numbers come from the ranking or the inventory quote those
 * directly. The rest fall back to the short detail line the owning wizard step
 * wrote when the user filled it in, and to "not entered yet" when there is
 * nothing to report — never to a made-up figure.
 */
export function contextSummary(
  area: MeedContextArea,
  facts: MeedContextFacts,
  t: TFunction,
): string {
  const stepSub = facts.states[area.key]?.sub;

  switch (area.key) {
    case "emissions":
      if (facts.emissionsText) {
        return facts.inventoryYear
          ? t("context-summary-emissions-year", {
              value: facts.emissionsText,
              year: facts.inventoryYear,
            })
          : t("context-summary-emissions", { value: facts.emissionsText });
      }
      return stepSub ?? t("context-summary-none");
    case "regulations":
      return facts.excludedCount !== null
        ? t("context-summary-legal", {
            included: facts.rankedCount,
            excluded: facts.excludedCount,
          })
        : (stepSub ?? t("context-summary-none"));
    case "policy":
      return facts.rankedCount > 0
        ? t("context-summary-policy", { count: facts.strongPolicyBacking })
        : (stepSub ?? t("context-summary-none"));
    case "ranking":
      return t("context-summary-ranking", { count: facts.rankedCount });
    default: {
      if (stepSub) return stepSub;
      // "Not entered yet" is only true of something the city enters. These
      // areas are produced by the model or the Global API, so saying the user
      // has not filled them in is both wrong and the input framing this
      // section exists to drop.
      const isComputed = MEED_OUTPUT_AREAS.some((a) => a.key === area.key);
      return t(
        isComputed ? "context-summary-computed" : "context-summary-none",
      );
    }
  }
}

// ─── Headline indicators ─────────────────────────────────────────────────────
// Each area leads with one number so the grid can be read at a glance. These
// were previously buried in a separate breakdown tab; promoting them is the
// whole point of the summary cards, since a sentence alone does not tell the
// user whether an area is worth opening.

export interface MeedContextStat {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}

/** The stats an area can quote, or an empty list when it has none of its own. */
export function contextStats(
  area: MeedContextArea,
  facts: MeedContextFacts,
  backing: MeedPolicyBacking,
  t: TFunction,
): MeedContextStat[] {
  const unknown = t("stat-unknown");
  switch (area.key) {
    case "emissions":
      return [
        {
          label: t("stat-total-emissions"),
          value: facts.emissionsText ?? unknown,
        },
        {
          label: t("stat-inventory-year"),
          value: facts.inventoryYear ? String(facts.inventoryYear) : unknown,
        },
      ];
    case "regulations":
      return [
        {
          label: t("stat-excluded"),
          value:
            facts.excludedCount !== null
              ? String(facts.excludedCount)
              : unknown,
          sub: t("stat-excluded-sub"),
          tone: facts.excludedCount ? "negative" : undefined,
        },
        {
          label: t("stat-included"),
          value: String(facts.rankedCount),
          sub: t("stat-included-sub"),
          tone: "positive",
        },
      ];
    case "policy":
      return [
        {
          label: t("stat-strongly-backed"),
          value: String(backing.strong),
          sub: t("stat-strongly-backed-sub"),
        },
        {
          label: t("stat-moderate-backing"),
          value: String(backing.moderate),
          sub: t("stat-moderate-backing-sub"),
        },
      ];
    case "ranking":
      return [
        {
          label: t("stat-ranked"),
          value: String(facts.rankedCount),
        },
      ];
    default:
      return [];
  }
}

/**
 * The single number a summary card leads with, or `null` when the prioritizer
 * reports none for that area — in which case the card shows the area's status
 * instead of inventing a figure.
 */
export function contextIndicator(
  area: MeedContextArea,
  facts: MeedContextFacts,
  backing: MeedPolicyBacking,
  t: TFunction,
): MeedContextStat | null {
  return contextStats(area, facts, backing, t)[0] ?? null;
}
