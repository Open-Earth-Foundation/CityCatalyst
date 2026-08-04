/**
 * TEMPORARY client-side persistence for MEED+ wizard choices, keyed per
 * inventory. This replaces the prototype's `hiap:{locode}:*` localStorage
 * families 1:1 until the CityCatalyst backend persistence lands
 * (MeedPreferences / MeedExclusion / MeedRanking models — Milan's track,
 * see docs/MeedModuleMigration.md §6.B). Swap these helpers for RTK Query
 * mutations then; the call sites should not need to change shape.
 */

import type { MeedTimeframePreference } from "@/util/types/meed";

export interface MeedStrategicPreferences {
  sectors: string[];
  strategicPriorities: string[];
  timeline: MeedTimeframePreference[];
  weights: { impact: number; alignment: number; feasibility: number };
  excludedSectors: string[];
  excludedCoBenefits: string[];
  excludeText: string;
}

export const DEFAULT_MEED_WEIGHTS = {
  impact: 55,
  alignment: 22,
  feasibility: 23,
};

export interface MeedStepState {
  visited?: boolean;
  confirmed?: boolean;
  progress?: number;
}

function key(inventoryId: string, suffix: string): string {
  return `meed:${inventoryId}:${suffix}`;
}

function read<T>(storageKey: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storageKey: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // storage full or unavailable — non-fatal, wizard state is recoverable
  }
}

export function getMeedPreferences(
  inventoryId: string,
): MeedStrategicPreferences | null {
  return read<MeedStrategicPreferences>(key(inventoryId, "preferences"));
}

export function setMeedPreferences(
  inventoryId: string,
  prefs: MeedStrategicPreferences,
): void {
  write(key(inventoryId, "preferences"), prefs);
}

export function getMeedConfirmedExclusions(inventoryId: string): string[] {
  return read<string[]>(key(inventoryId, "exclusions")) ?? [];
}

export function setMeedConfirmedExclusions(
  inventoryId: string,
  actionIds: string[],
): void {
  write(key(inventoryId, "exclusions"), actionIds);
}

export function getMeedStepState(
  inventoryId: string,
  stepKey: string,
): MeedStepState {
  return read<MeedStepState>(key(inventoryId, `step:${stepKey}`)) ?? {};
}

export function setMeedStepState(
  inventoryId: string,
  stepKey: string,
  state: MeedStepState,
): void {
  write(key(inventoryId, `step:${stepKey}`), {
    ...getMeedStepState(inventoryId, stepKey),
    ...state,
  });
}
