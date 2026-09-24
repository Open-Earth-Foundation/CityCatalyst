import { getGhgiInventoryPath } from "@/util/ghgi-routes";
import { isFetchBaseQueryError } from "@/util/helpers";

// Only the GHG inventory reports "empty" (it exists but holds no data, so it
// cannot inform a run) and "partial" (the run uses it but sectors are missing).
export type ContextSourceState =
  | "unavailable"
  | "available"
  | "empty"
  | "selected"
  | "processing"
  | "included"
  | "partial"
  | "failed";

interface RunSourceStateInput {
  cityAvailable: boolean;
  included: boolean;
  bundleStatus: string | null;
  sourceStatus?: string | null;
  selected?: boolean;
  empty?: boolean;
}

export function getCitySourceState(
  available: boolean,
  failed = false,
  empty = false,
): ContextSourceState {
  if (failed) return "failed";
  if (available && empty) return "empty";
  return available ? "available" : "unavailable";
}

export function getRunSourceState({
  cityAvailable,
  included,
  bundleStatus,
  sourceStatus,
  selected = false,
  empty = false,
}: RunSourceStateInput): ContextSourceState {
  if (bundleStatus === "building" || sourceStatus === "pending") {
    return cityAvailable || selected || included ? "processing" : "unavailable";
  }
  // An empty source contributes nothing, even if an older build included it.
  if (cityAvailable && empty) return "empty";
  if (included) return sourceStatus === "partial" ? "partial" : "included";
  if (sourceStatus === "unavailable") return "unavailable";
  if (sourceStatus === "failed") return "failed";
  if (cityAvailable && bundleStatus === "failed") return "failed";
  if (selected) return "selected";
  return getCitySourceState(cityAvailable);
}

export function contextSourceHelpKey(
  state: ContextSourceState,
  scope: "city" | "run",
): string {
  switch (state) {
    case "unavailable":
      return scope === "city"
        ? "source-help-city-unavailable"
        : "source-help-run-unavailable";
    case "available":
      return scope === "city"
        ? "source-help-city-available"
        : "source-help-run-available";
    case "empty":
      return scope === "city"
        ? "inventory-empty-detail-city"
        : "inventory-empty-detail";
    case "selected":
      return "source-help-selected";
    case "processing":
      return "source-help-processing";
    case "included":
      return "source-help-included";
    case "partial":
      return "inventory-partial";
    case "failed":
      return "source-help-failed";
  }
}

export function contextSourceStatusKey(state: ContextSourceState): string {
  switch (state) {
    case "available":
      return "available-in-city";
    case "empty":
      return "inventory-empty";
    case "selected":
      return "selected-for-run";
    case "processing":
      return "status-processing";
    case "included":
      return "included-in-run";
    case "partial":
      return "included-partial";
    case "failed":
      return "status-failed";
    case "unavailable":
      return "not-available";
  }
}

export function contextSourceTone(
  state: ContextSourceState,
): "positive" | "neutral" | "warning" {
  if (state === "available" || state === "selected" || state === "included") {
    return "positive";
  }
  if (state === "failed" || state === "empty" || state === "partial") {
    return "warning";
  }
  return "neutral";
}

/** A 404 means the city has no such source yet, not that loading it failed. */
export function isSourceLookupFailure(error: unknown): boolean {
  return (
    Boolean(error) && !(isFetchBaseQueryError(error) && error.status === 404)
  );
}

export type InventoryActionKind = "create" | "fill" | "choose";

/**
 * The inventory card's next step: create an inventory when the city has none,
 * fill an empty one, otherwise choose which inventory a run uses. Create and
 * fill link to GHGI; choosing only applies inside a run.
 */
export function inventorySourceAction(
  state: ContextSourceState,
  {
    lng,
    cityId,
    inventoryId,
  }: { lng: string; cityId: string; inventoryId: string | null },
): { kind: InventoryActionKind; labelKey: string; href?: string } | undefined {
  if (state === "failed" || state === "processing") return undefined;
  if (!inventoryId) {
    return {
      kind: "create",
      labelKey: "create-inventory",
      href: `/${lng}/cities/${cityId}/GHGI/onboarding`,
    };
  }
  if (state === "empty") {
    return {
      kind: "fill",
      labelKey: "add-inventory-data",
      href: getGhgiInventoryPath(lng, cityId, inventoryId, "data"),
    };
  }
  return { kind: "choose", labelKey: "inventory-choose-different" };
}
