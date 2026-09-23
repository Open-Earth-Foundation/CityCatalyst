/**
 * Adapts the fixture bank to the catalog index the MEED results components
 * read (`MeedActionIndex`), so `TopPicks`, `RankingTable`, `DetailPanel` and
 * the glance chart render adaptation actions unchanged.
 */
import type {
  MeedActionIndex,
  MeedCatalogAction,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/actionCatalog";
import type { AdaptationAction, CityFixture, MitigationShift } from "./types";
import { pick } from "./localized";
import { SECTOR_LABEL } from "./riskCells";
import { cellImpacts } from "./ranking";
import { suppressedCoBenefits } from "./coBenefits";

/** Impact 0–1 → the five-level scale the top-pick cards print. */
function level(raw: number): number {
  if (raw <= 0) return 0;
  if (raw < 0.15) return 1;
  if (raw < 0.3) return 2;
  if (raw < 0.5) return 3;
  if (raw < 0.75) return 4;
  return 5;
}

export function adaptationIndex(
  actions: AdaptationAction[],
  city: CityFixture,
  lng: string,
): MeedActionIndex {
  const index: MeedActionIndex = new Map();
  for (const action of actions) {
    const suppressed = new Set(suppressedCoBenefits(action));
    const coBenefits: NonNullable<MeedCatalogAction["coBenefits"]> = {};
    for (const [key, score] of Object.entries(action.coBenefits)) {
      if (suppressed.has(key as never)) continue;
      coBenefits[key] = {
        impact_numeric: score,
        impact_relationship:
          score < 0 ? "negative" : score > 0 ? "positive" : "neutral",
      };
    }
    const raw = cellImpacts(action, city)[0]?.raw ?? 0;
    index.set(action.id, {
      actionId: action.id,
      actionName: pick(action.name, lng),
      description: pick(action.description, lng),
      sectorTag: action.sector,
      sectorLabel: pick(SECTOR_LABEL[action.sector], lng),
      timelineForImplementation: action.timeline,
      coBenefits,
      // The card's "reduction potential" slot carries the risk-credit level.
      emissions: { impact_numeric: level(raw) },
    });
  }
  return index;
}

export function mitigationIndex(
  shifts: MitigationShift[],
  lng: string,
): MeedActionIndex {
  const index: MeedActionIndex = new Map();
  for (const shift of shifts) {
    for (const intervention of shift.interventions) {
      const coBenefits: NonNullable<MeedCatalogAction["coBenefits"]> = {};
      for (const [key, score] of Object.entries(intervention.coBenefits)) {
        coBenefits[key] = {
          impact_numeric: score,
          impact_relationship:
            score < 0 ? "negative" : score > 0 ? "positive" : "neutral",
        };
      }
      index.set(intervention.id, {
        actionId: intervention.id,
        actionName: pick(intervention.name, lng),
        description: pick(intervention.description, lng),
        sectorTag: shift.sectorTag,
        timelineForImplementation: intervention.timeline,
        coBenefits,
        emissions: {
          impact_numeric: Math.max(1, Math.round(intervention.impact * 5)),
        },
      });
    }
  }
  return index;
}
