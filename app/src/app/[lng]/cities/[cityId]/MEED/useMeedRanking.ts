"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getMeedRanking,
  MEED_STATE_CHANGED_EVENT,
  type MeedStoredRanking,
} from "./meedLocalState";
import { inputsFingerprint, type MeedSectionStates } from "./meedStatus";

export interface MeedRankingState {
  ranking: MeedStoredRanking | null;
  /** Inputs have changed since the ranking was produced. */
  isStale: boolean;
  /** The store has been read (it is client-only, so not on first render). */
  isReady: boolean;
}

/**
 * The single source of truth for "does a ranking exist for this inventory".
 *
 * Both the landing screen and the results screen read this. They previously
 * had separate sources — the landing screen read stored state while results
 * held its own hard-coded null — so the landing screen could advertise a
 * ranking that results then denied existed.
 *
 * TODO(meed backend): when the prioritization service lands, this hook becomes
 * the RTK Query call. Every consumer keeps working, because they already agree
 * to read the ranking from exactly one place.
 */
export function useMeedRanking(
  inventoryId: string | undefined,
  states: MeedSectionStates,
): MeedRankingState {
  const [ranking, setRanking] = useState<MeedStoredRanking | null>(null);
  const [isReady, setIsReady] = useState(false);

  const refresh = useCallback(() => {
    if (!inventoryId) return;
    setRanking(getMeedRanking(inventoryId));
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

  const isStale = Boolean(
    ranking?.inputsFingerprint &&
      ranking.inputsFingerprint !== inputsFingerprint(states),
  );

  return { ranking, isStale, isReady };
}
