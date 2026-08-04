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

export interface MeedRankingSummary {
  generatedAtUtc: string;
  totalRanked: number;
  /** First few action names, already localized when written. */
  topActions: string[];
  excludedCount?: number;
  /**
   * Fingerprint of the inputs this ranking was produced from, so the overview
   * can tell the user when their answers have moved on since.
   */
  inputsFingerprint?: string;
}

export function getMeedRanking(inventoryId: string): MeedRankingSummary | null {
  return read<MeedRankingSummary>(key(inventoryId, "ranking"));
}

export function setMeedRanking(
  inventoryId: string,
  summary: MeedRankingSummary,
): void {
  write(key(inventoryId, "ranking"), summary);
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
