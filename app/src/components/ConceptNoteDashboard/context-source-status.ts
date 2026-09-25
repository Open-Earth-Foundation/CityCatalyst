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

// Help text per state; states that read differently per scope split it.
const HELP_KEYS: Record<
  ContextSourceState,
  string | { city: string; run: string }
> = {
  unavailable: {
    city: "source-help-city-unavailable",
    run: "source-help-run-unavailable",
  },
  available: {
    city: "source-help-city-available",
    run: "source-help-run-available",
  },
  empty: { city: "inventory-empty-detail-city", run: "inventory-empty-detail" },
  selected: "source-help-selected",
  processing: "source-help-processing",
  included: "source-help-included",
  partial: "inventory-partial",
  failed: "source-help-failed",
};

const STATUS_KEYS: Record<ContextSourceState, string> = {
  available: "available-in-city",
  empty: "inventory-empty",
  selected: "selected-for-run",
  processing: "status-processing",
  included: "included-in-run",
  partial: "included-partial",
  failed: "status-failed",
  unavailable: "not-available",
};

export function contextSourceHelpKey(
  state: ContextSourceState,
  scope: "city" | "run",
): string {
  const key = HELP_KEYS[state];
  return typeof key === "string" ? key : key[scope];
}

/** A source still loading shows as processing whatever its last state. */
export function contextSourceStatusKey(
  state: ContextSourceState,
  loading = false,
): string {
  return loading ? "status-processing" : STATUS_KEYS[state];
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
):
  | { kind: "create" | "fill" | "choose"; labelKey: string; href?: string }
  | undefined {
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
