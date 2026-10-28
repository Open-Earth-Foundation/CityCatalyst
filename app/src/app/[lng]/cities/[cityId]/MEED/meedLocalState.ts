/**
 * TEMPORARY client-side persistence for MEED+ wizard choices, keyed per
 * inventory. This replaces the prototype's `hiap:{locode}:*` localStorage
 * families 1:1 until the CityCatalyst backend persistence lands
 * (MeedPreferences / MeedExclusion / MeedRanking models — Milan's track,
 * see docs/MeedModuleMigration.md §6.B). Swap these helpers for RTK Query
 * mutations then; the call sites should not need to change shape.
 */

import { PILLAR_WEIGHTS } from "./scoringWeights";
import type {
  MeedPrioritizeCityResult,
  MeedTimeframePreference,
} from "@/util/types/meed";

export interface MeedStrategicPreferences {
  sectors: string[];
  strategicPriorities: string[];
  timeline: MeedTimeframePreference[];
  weights: { impact: number; alignment: number; feasibility: number };
  excludedSectors: string[];
  excludedCoBenefits: string[];
  excludeText: string;
}

/**
 * Slider defaults, as whole-number percentages. Derived from the prioritizer's
 * own pillar weights so this cannot drift from `scoringWeights.ts`.
 */
export const DEFAULT_MEED_WEIGHTS = {
  impact: Math.round(PILLAR_WEIGHTS.impact * 100),
  alignment: Math.round(PILLAR_WEIGHTS.alignment * 100),
  feasibility: Math.round(PILLAR_WEIGHTS.feasibility * 100),
};

export interface MeedStepState {
  visited?: boolean;
  /**
   * The user explicitly saved/acknowledged this step. Once true it never goes
   * back to false — a later automatic data refresh must not undo a human
   * acknowledgement.
   */
  confirmed?: boolean;
  progress?: number;
  /**
   * Short live detail line shown under the step on the overview and the
   * pre-flight summary, e.g. "4 of 6 sectors with data". Already localized by
   * the writing screen.
   */
  sub?: string;
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
  // Every other writer here announces itself; this one staying silent is how a
  // future reader of the exclusions would miss updates made in the same tab.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MEED_STATE_CHANGED_EVENT));
  }
}

export function getMeedStepState(
  inventoryId: string,
  stepKey: string,
): MeedStepState {
  return read<MeedStepState>(key(inventoryId, `step:${stepKey}`)) ?? {};
}

/** Event other components listen to so wizard progress stays in sync in-tab. */
export const MEED_STATE_CHANGED_EVENT = "meed:state-changed";

export function setMeedStepState(
  inventoryId: string,
  stepKey: string,
  state: MeedStepState,
): void {
  const previous = getMeedStepState(inventoryId, stepKey);
  write(key(inventoryId, `step:${stepKey}`), {
    ...previous,
    ...state,
    // Confirmation is a human acknowledgement; never let a refresh clear it.
    confirmed: previous.confirmed || state.confirmed,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MEED_STATE_CHANGED_EVENT));
  }
}

// ─── Generated ranking ───────────────────────────────────────────────────────

/**
 * A generated ranking, stored whole.
 *
 * The full prioritizer result is kept — not a summary — because the landing
 * screen and the results screen must never disagree about whether a ranking
 * exists. Storing a summary for one and leaving the other to its own source is
 * exactly how the two ended up contradicting each other.
 */
export interface MeedStoredRanking {
  result: MeedPrioritizeCityResult;
  generatedAtUtc: string;
  /**
   * Fingerprint of the inputs this ranking came from, so the UI can tell the
   * user when their answers have moved on since.
   */
  inputsFingerprint?: string;
  /** True when this came from the catalog-backed mock rather than the service. */
  isMock?: boolean;
}

export function getMeedRanking(inventoryId: string): MeedStoredRanking | null {
  return read<MeedStoredRanking>(key(inventoryId, "ranking"));
}

export function setMeedRanking(
  inventoryId: string,
  ranking: MeedStoredRanking,
): void {
  write(key(inventoryId, "ranking"), ranking);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MEED_STATE_CHANGED_EVENT));
  }
}

export function clearMeedRanking(inventoryId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(inventoryId, "ranking"));
    window.dispatchEvent(new Event(MEED_STATE_CHANGED_EVENT));
  } catch {
    // non-fatal
  }
}
