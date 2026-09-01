"use client";
import { useSearchParams } from "next/navigation";
import { getMeedPath } from "./steps";

/**
 * Where a screen should return to when the user finishes with it.
 *
 * The wizard is a graph, not a line: you can open a step from the overview, from
 * the pre-flight summary ("enter data") or from the results screen ("view the
 * emissions behind this ranking"). Each of those needs the step's back link and
 * primary button to lead back where the user actually came from, otherwise
 * editing one field from pre-flight dumps you into the middle of the wizard.
 */
export type MeedReturnTarget = "overview" | "preflight" | "results";

const VALID: MeedReturnTarget[] = ["overview", "preflight", "results"];

export interface MeedReturn {
  target: MeedReturnTarget;
  /** Tab to restore on the results screen, when returning there. */
  tab?: string;
  /** True when the user arrived from somewhere other than the overview. */
  isExplicit: boolean;
}

export function parseReturn(
  from: string | null,
  tab?: string | null,
): MeedReturn {
  const target = VALID.includes(from as MeedReturnTarget)
    ? (from as MeedReturnTarget)
    : "overview";
  return {
    target,
    tab: tab ?? undefined,
    isExplicit: target !== "overview",
  };
}

/** Reads the return context from the current URL. */
export function useMeedReturn(): MeedReturn {
  const params = useSearchParams();
  return parseReturn(params.get("from"), params.get("tab"));
}

/** Absolute href for where a step should send the user when it is done. */
export function returnHref(
  lng: string,
  cityId: string,
  inventoryId: string,
  ret: MeedReturn,
): string {
  switch (ret.target) {
    case "preflight":
      return getMeedPath(lng, cityId, inventoryId, "preflight");
    case "results": {
      const base = getMeedPath(lng, cityId, inventoryId, "results");
      return ret.tab ? `${base}?tab=${ret.tab}` : base;
    }
    default:
      return getMeedPath(lng, cityId, inventoryId);
  }
}

/** i18n key (in the `meed` namespace) for the back link's label. */
export function returnLabelKey(ret: MeedReturn): string {
  switch (ret.target) {
    case "preflight":
      return "back-to-preflight";
    case "results":
      return "back-to-results";
    default:
      return "back-to-overview";
  }
}

/**
 * Href for a step, carrying the return context forward so the step knows where
 * to send the user back to. Omits `?from=` for the default (overview) case to
 * keep URLs clean and shareable.
 */
export function stepHref(
  lng: string,
  cityId: string,
  inventoryId: string,
  segment: string,
  from?: MeedReturnTarget,
  tab?: string,
): string {
  const base = getMeedPath(lng, cityId, inventoryId, segment);
  if (!from || from === "overview") return base;
  const query = new URLSearchParams({ from });
  if (tab) query.set("tab", tab);
  return `${base}?${query.toString()}`;
}
