"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getMeedStepState,
  MEED_STATE_CHANGED_EVENT,
  type MeedStepState,
} from "./meedLocalState";
import { MEED_ALL_SECTIONS, MEED_WIZARD_STEPS } from "./steps";

/**
 * Four-state model for a wizard section.
 *
 * `needs-review` is the important one: data can arrive automatically (an
 * inventory is already there, indicators load from the API) without the user
 * having looked at it. Those sections are complete as far as data goes, but the
 * user still has to acknowledge them — which is what `confirmed` records.
 */
export type MeedSectionStatus =
  "not-started" | "in-progress" | "needs-review" | "complete";

export function statusOf(state: MeedStepState): MeedSectionStatus {
  const progress = state.progress ?? 0;
  if (!state.visited && progress === 0) return "not-started";
  if (progress >= 100) return state.confirmed ? "complete" : "needs-review";
  if (progress === 0 && !state.confirmed) return "in-progress";
  return "in-progress";
}

export interface MeedSectionState extends MeedStepState {
  key: string;
  status: MeedSectionStatus;
}

export type MeedSectionStates = Record<string, MeedSectionState>;

function readAll(inventoryId: string): MeedSectionStates {
  const out: MeedSectionStates = {};
  // Output areas are read too: the results cards quote the detail line those
  // screens wrote, even though they are no longer steps in the wizard.
  for (const step of MEED_ALL_SECTIONS) {
    const state = getMeedStepState(inventoryId, step.key);
    out[step.key] = { ...state, key: step.key, status: statusOf(state) };
  }
  return out;
}

const EMPTY: MeedSectionStates = {};

/**
 * Reads every step's stored state for one inventory.
 *
 * Read in an effect rather than during render: the store is localStorage, so
 * reading it on the server (or on the first client render) would produce a
 * hydration mismatch. Re-reads when the tab regains focus and when any screen
 * writes progress, so the overview is correct after coming back from a step.
 */
export function useMeedSectionStates(inventoryId: string | undefined): {
  states: MeedSectionStates;
  isReady: boolean;
} {
  const [states, setStates] = useState<MeedSectionStates>(EMPTY);
  const [isReady, setIsReady] = useState(false);

  const refresh = useCallback(() => {
    if (!inventoryId) return;
    setStates(readAll(inventoryId));
    setIsReady(true);
  }, [inventoryId]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(MEED_STATE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(MEED_STATE_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return { states, isReady };
}

export function countByStatus(states: MeedSectionStates) {
  const values = Object.values(states);
  return {
    complete: values.filter((s) => s.status === "complete").length,
    needsReview: values.filter((s) => s.status === "needs-review").length,
    inProgress: values.filter((s) => s.status === "in-progress").length,
    notStarted: values.filter((s) => s.status === "not-started").length,
    total: MEED_WIZARD_STEPS.length,
  };
}

/**
 * Fingerprint of every input that feeds a ranking. Stored alongside a generated
 * ranking so the overview can tell whether the user's answers have moved on
 * since — a ranking that no longer matches its inputs should say so rather than
 * quietly look current.
 *
 * Deliberately keyed on `progress` and `sub` only, NOT on `status`.
 * `status` is derived, and `confirmed` is one of its inputs — so including it
 * would mean simply walking back through the wizard (which confirms each step)
 * changed the fingerprint and made every ranking report itself stale, without a
 * single input having changed. `progress` and `sub` are what actually move when
 * the data does.
 */
export function inputsFingerprint(states: MeedSectionStates): string {
  return MEED_WIZARD_STEPS.map((step) => {
    const state = states[step.key];
    return [step.key, state?.progress ?? 0, state?.sub ?? ""].join(":");
  }).join("|");
}
