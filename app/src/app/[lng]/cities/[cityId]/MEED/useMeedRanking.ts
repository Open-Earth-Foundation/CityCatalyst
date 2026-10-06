"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useGetMeedRankingQuery } from "@/services/api";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import {
  getMeedRanking,
  MEED_STATE_CHANGED_EVENT,
  type MeedStoredRanking,
} from "./meedLocalState";
import {
  rankingGeneratedAt,
  toMeedPrioritizeCityResult,
} from "./meedRankingAdapter";
import { inputsFingerprint, type MeedSectionStates } from "./meedStatus";

export interface MeedRankingState {
  ranking: MeedStoredRanking | null;
  /** Inputs have changed since the ranking was produced. */
  isStale: boolean;
  /** The ranking's whereabouts are known — not "a ranking exists". */
  isReady: boolean;
  /** The fetch failed and no stored ranking covered for it. */
  isError: boolean;
}

/**
 * The single source of truth for "does a ranking exist for this inventory".
 *
 * Four screens read this. The stored ranking now lives on the server, so this
 * hook is the GET; local storage is kept for two jobs it is still the right
 * place for:
 *
 * - **the mock story** — with MEED_MOCK_RANKING on nothing is fetched at all,
 *   so the module still demonstrates end to end with no service behind it;
 * - **the staleness fingerprint** — "your inputs changed since this ranking"
 *   is a fact about local wizard state that the server has no view of, so the
 *   fingerprint recorded when the ranking ran is read from storage and paired
 *   with the fetched result.
 *
 * The signature is unchanged on purpose: every consumer already agreed to read
 * the ranking from exactly one place, so none of them had to change.
 */
export function useMeedRanking(
  inventoryId: string | undefined,
  states: MeedSectionStates,
): MeedRankingState {
  // Read from the route rather than taking a new argument — all four consumers
  // live under /cities/[cityId]/, and the signature is load-bearing.
  const params = useParams<{ cityId?: string }>();
  const cityId = params?.cityId;

  const isMockMode = hasFeatureFlag(FeatureFlags.MEED_MOCK_RANKING);

  const [stored, setStored] = useState<MeedStoredRanking | null>(null);
  const [hasReadStore, setHasReadStore] = useState(false);

  const refresh = useCallback(() => {
    if (!inventoryId) return;
    setStored(getMeedRanking(inventoryId));
    setHasReadStore(true);
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

  const { data, isSuccess, isError, isLoading } = useGetMeedRankingQuery(
    { cityId: cityId ?? "", inventoryId: inventoryId ?? "" },
    { skip: isMockMode || !cityId || !inventoryId },
  );

  const fetched = useMemo<MeedStoredRanking | null>(() => {
    if (isMockMode || !isSuccess || !data) return null;
    const result = toMeedPrioritizeCityResult(data);
    // An empty envelope means "no ranking has been run", not "a ranking of
    // nothing" — the results screen must not treat it as a delivered answer.
    if ((result.ranked_actions?.length ?? 0) === 0) return null;
    return {
      result,
      generatedAtUtc: rankingGeneratedAt(data) ?? "",
      // Fingerprint is local-only; pair the fetched ranking with the one
      // recorded when it was generated so `isStale` keeps working.
      inputsFingerprint: stored?.inputsFingerprint,
      isMock: false,
    };
  }, [isMockMode, isSuccess, data, stored?.inputsFingerprint]);

  // Storage is the fallback, not the primary: it still answers for mock mode,
  // and for a ranking generated before this screen started fetching.
  const ranking = isMockMode ? stored : (fetched ?? stored);

  const isReady = isMockMode
    ? hasReadStore
    : hasReadStore &&
      (!cityId || !inventoryId || isSuccess || isError || !isLoading);

  const isStale = Boolean(
    ranking?.inputsFingerprint &&
    ranking.inputsFingerprint !== inputsFingerprint(states),
  );

  // Only an error the user can see the consequences of: a stored ranking
  // still rendering makes a failed refetch a non-event.
  return { ranking, isStale, isReady, isError: isError && !ranking };
}
