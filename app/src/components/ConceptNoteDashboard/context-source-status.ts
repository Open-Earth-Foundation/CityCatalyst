import { getGhgiInventoryPath } from "@/util/ghgi-routes";

// "empty": the source exists in the city but holds no data yet (only the GHG
// inventory reports this), so it cannot inform a run until data is added.
export type ContextSourceState =
  | "unavailable"
  | "available"
  | "empty"
  | "selected"
  | "processing"
  | "included"
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
  if (included) return "included";
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
  if (state === "failed" || state === "empty") return "warning";
  return "neutral";
}

/**
 * Where to fix a missing or empty GHG inventory in CityCatalyst: create one,
 * or add data to the existing one. Other states need no inventory link.
 */
export function inventorySourceLink(
  state: ContextSourceState,
  {
    lng,
    cityId,
    inventoryId,
  }: { lng: string; cityId: string; inventoryId: string | null },
):
  | { labelKey: "create-inventory" | "add-inventory-data"; href: string }
  | undefined {
  if (state === "empty" && inventoryId) {
    return {
      labelKey: "add-inventory-data",
      href: getGhgiInventoryPath(lng, cityId, inventoryId, "data"),
    };
  }
  if (state === "unavailable" && !inventoryId) {
    return {
      labelKey: "create-inventory",
      href: `/${lng}/cities/${cityId}/GHGI/onboarding`,
    };
  }
  return undefined;
}
