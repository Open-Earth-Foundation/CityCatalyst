"use client";
import { useEffect, useState } from "react";
import {
  getMeedConfirmedExclusions,
  getMeedPreferences,
  MEED_STATE_CHANGED_EVENT,
  type MeedStrategicPreferences,
} from "../meedLocalState";

/**
 * The stored preferences and confirmed exclusions for an inventory, kept in
 * step with the module's state-changed event. Read in an effect, not during
 * render, so the server and the first client render agree.
 */
export function useMeedStoredPreferences(inventoryId: string) {
  const [prefs, setPrefs] = useState<MeedStrategicPreferences | null>(null);
  const [exclusions, setExclusions] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => {
      setPrefs(getMeedPreferences(inventoryId));
      setExclusions(getMeedConfirmedExclusions(inventoryId));
    };
    refresh();
    window.addEventListener(MEED_STATE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MEED_STATE_CHANGED_EVENT, refresh);
  }, [inventoryId]);

  return { prefs, exclusions };
}

/** API option keys use snake_case; locale keys are kebab-case. */
export const prefKeyToLocale = (key: string) => key.replace(/_/g, "-");

/** True when the city has set anything that changes the ranking's inputs. */
export function hasStoredPreferences(
  prefs: MeedStrategicPreferences | null,
  exclusions: string[],
): boolean {
  if (exclusions.length > 0) return true;
  if (!prefs) return false;
  return (
    (prefs.sectors?.length ?? 0) > 0 ||
    (prefs.strategicPriorities?.length ?? 0) > 0 ||
    (prefs.timeline?.length ?? 0) > 0 ||
    (prefs.excludedSectors?.length ?? 0) > 0 ||
    (prefs.excludedCoBenefits?.length ?? 0) > 0
  );
}
