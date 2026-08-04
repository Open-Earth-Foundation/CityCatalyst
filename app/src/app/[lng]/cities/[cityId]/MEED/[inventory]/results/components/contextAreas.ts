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
    default:
      return stepSub ?? t("context-summary-none");
  }
}
