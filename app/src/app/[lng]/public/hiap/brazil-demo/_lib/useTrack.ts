"use client";
/**
 * Everything a screen needs about one city on one track, derived once from the
 * fixtures and the browser-held city inputs.
 */
import { useMemo } from "react";
import type { MeedRankedActionResult } from "@/util/types/meed";
import type { MeedActionIndex } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/actionCatalog";
import type { MeedScoreWeights } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/rankingFacts";
import { ADAPTATION_ACTIONS } from "./actions";
import { CITY_BY_SLUG, DEFAULT_CITY } from "./cities";
import { adaptationIndex, mitigationIndex } from "./catalog";
import {
  MITIGATION_SHIFTS,
  MITIGATION_WEIGHTS,
  mitigationRanked,
} from "./mitigation";
import {
  rankAdaptation,
  toRankedResults,
  type AdaptationRanking,
} from "./ranking";
import { useDemoState } from "./state";
import type { CityFixture, DemoTrack } from "./types";

export function cityFromSlug(slug: string): CityFixture {
  return CITY_BY_SLUG[slug] ?? DEFAULT_CITY;
}

export interface TrackData {
  city: CityFixture;
  track: DemoTrack;
  index: MeedActionIndex;
  ranked: MeedRankedActionResult[];
  weights: MeedScoreWeights;
  /** Adaptation only. */
  adaptation: AdaptationRanking | null;
  state: ReturnType<typeof useDemoState>["state"];
  isReady: boolean;
  setPreferences: ReturnType<typeof useDemoState>["setPreferences"];
  markVisited: ReturnType<typeof useDemoState>["markVisited"];
  markGenerated: ReturnType<typeof useDemoState>["markGenerated"];
  reset: ReturnType<typeof useDemoState>["reset"];
}

export function useTrack(
  lng: string,
  citySlug: string,
  track: DemoTrack,
): TrackData {
  const city = cityFromSlug(citySlug);
  const { state, isReady, setPreferences, markVisited, markGenerated, reset } =
    useDemoState(city.slug, track);

  const adaptation = useMemo(
    () =>
      track === "adaptation"
        ? rankAdaptation(city, ADAPTATION_ACTIONS, state.preferences)
        : null,
    [track, city, state.preferences],
  );

  const index = useMemo(
    () =>
      track === "adaptation"
        ? adaptationIndex(ADAPTATION_ACTIONS, city, lng)
        : mitigationIndex(MITIGATION_SHIFTS, lng),
    [track, city, lng],
  );

  const ranked = useMemo(
    () =>
      adaptation
        ? toRankedResults(adaptation, lng)
        : mitigationRanked(MITIGATION_SHIFTS),
    [adaptation, lng],
  );

  const w = state.preferences.weights;
  const weights: MeedScoreWeights = useMemo(
    () =>
      track === "adaptation"
        ? {
            impact: w.impact / 100,
            alignment: w.alignment / 100,
            feasibility: w.feasibility / 100,
          }
        : MITIGATION_WEIGHTS,
    [track, w.impact, w.alignment, w.feasibility],
  );

  return {
    city,
    track,
    index,
    ranked,
    weights,
    adaptation,
    state,
    isReady,
    setPreferences,
    markVisited,
    markGenerated,
    reset,
  };
}
