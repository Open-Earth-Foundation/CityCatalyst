import type { TFunction } from "i18next";
import { SECTORS } from "@/util/constants";
import type { MeedStepState } from "./meedLocalState";
import type { MeedSectionState } from "./meedStatus";

/**
 * Emissions data reaches MEED with one action on the home screen: "Retrieve
 * emissions data" pulls the inventory totals CityCatalyst already holds and
 * records the pull as the emissions step being complete. Both the home screen
 * and the breakdown page write that state through here so they can never
 * disagree about what "retrieved" means.
 */

/** The minimal slice of the inventory results the retrieval reads. */
export interface MeedEmissionsResults {
  totalEmissions?: {
    bySector?: { sectorName: string; co2eq: string | number | bigint }[];
  } | null;
}

/** How many GPC sectors report emissions above zero. */
export function countSectorsWithData(
  results: MeedEmissionsResults | undefined,
): number {
  const bySector = results?.totalEmissions?.bySector ?? [];
  return SECTORS.filter((s) =>
    bySector.some((e) => e.sectorName === s.name && Number(e.co2eq) > 0),
  ).length;
}

/**
 * The step state a successful retrieval writes. Progress is always 100: the
 * inventory is what it is, and a city with three sectors of data is just as
 * retrieved as one with five. Coverage lives in the detail line instead.
 */
export function emissionsRetrievedState(
  results: MeedEmissionsResults | undefined,
  t: TFunction,
): MeedStepState {
  const n = countSectorsWithData(results);
  // An inventory with no emissions gives the model nothing to score, so the
  // pull is recorded (visited) but never counts as complete: the gate stays
  // shut and the home screen points the user at the GHGI module instead.
  if (n === 0) {
    return {
      visited: true,
      confirmed: false,
      progress: 0,
      sub: t("emissions-none-sub"),
    };
  }
  return {
    visited: true,
    confirmed: true,
    progress: 100,
    sub: t("emissions-step-sub", { n, total: SECTORS.length }),
  };
}

export function hasEmissionsData(
  results: MeedEmissionsResults | undefined,
): boolean {
  return countSectorsWithData(results) > 0;
}

export function isEmissionsRetrieved(
  state: MeedSectionState | undefined,
): boolean {
  return state?.status === "complete";
}

/** The pull happened but found nothing to rank on. */
export function isEmissionsEmpty(state: MeedSectionState | undefined): boolean {
  return Boolean(state?.visited) && state?.status === "in-progress";
}
