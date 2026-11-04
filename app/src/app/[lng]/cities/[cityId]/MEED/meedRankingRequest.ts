/**
 * Builds the POST body for the ranking route from the wizard's stored state.
 *
 * Kept apart from the processing screen so the mapping — which local field
 * becomes which request field — is testable without rendering anything. Two
 * details are easy to get backwards and are asserted in the tests:
 *
 * - `cityStrategicPreferenceSectors` is the city's **priority** sectors, not
 *   the excluded ones. Exclusions travel as resolved action IDs.
 * - `excludedActionIds` comes from the pre-flight confirmation, never from the
 *   raw criteria: the user reviews and approves specific actions there, and
 *   that approval is the thing the ranking must honour.
 */
import type {
  MeedRunRankingRequest,
  MeedTimeframePreference,
} from "@/util/types/meed";
import {
  DEFAULT_MEED_WEIGHTS,
  type MeedStrategicPreferences,
} from "./meedLocalState";

/** Matches the route's own default when the city expressed no preference. */
const DEFAULT_TIMEFRAMES: MeedTimeframePreference[] = ["no_preference"];

/**
 * English is the engine's canonical explanation language; the page language
 * is requested next to it so the detail drawer can show the explanation in
 * the language the user is reading. One language means one less translation
 * call, so the two are never duplicated.
 */
export function requestedLanguagesFor(language?: string): string[] {
  return language && language !== "en" ? ["en", language] : ["en"];
}

const DEFAULT_TOP_N = 20;

/**
 * Slider weights as the backend expresses them.
 *
 * The sliders store whole percents that always total 100; the service reports
 * weights back as fractions of 1 (`0.55`), so they are converted here to match
 * what comes back — otherwise the results drawer would print its arithmetic
 * against a different scale than it sent.
 */
function toWeightsOverride(
  preferences: MeedStrategicPreferences | null,
): Record<string, number> {
  const weights = preferences?.weights;
  if (!weights) return {};

  const isDefault = (
    Object.keys(DEFAULT_MEED_WEIGHTS) as (keyof typeof DEFAULT_MEED_WEIGHTS)[]
  ).every((key) => weights[key] === DEFAULT_MEED_WEIGHTS[key]);
  // `{}` is the route's "use your defaults" — say nothing rather than restating
  // the defaults, so a change to them upstream is not silently overridden.
  if (isDefault) return {};

  const total = weights.impact + weights.alignment + weights.feasibility;
  if (!Number.isFinite(total) || total <= 0) return {};

  return {
    impact: weights.impact / total,
    alignment: weights.alignment / total,
    feasibility: weights.feasibility / total,
  };
}

export interface BuildRunRankingRequestParams {
  inventoryId: string;
  preferences: MeedStrategicPreferences | null;
  /** Confirmed on the pre-flight screen; `[]` when the user confirmed none. */
  excludedActionIds: string[];
  /** The page language (i18n `lng`); explanations are produced in it too. */
  language?: string;
  topN?: number;
}

export function buildRunRankingRequest({
  inventoryId,
  preferences,
  excludedActionIds,
  language,
  topN = DEFAULT_TOP_N,
}: BuildRunRankingRequestParams): MeedRunRankingRequest {
  const timeframes = preferences?.timeline ?? [];

  return {
    inventoryId,
    requestedLanguages: requestedLanguagesFor(language),
    topN,
    createExplanations: true,
    // An array even though one inventory means one city — the upstream
    // prioritizer's batch shape showing through the route.
    cityDataList: [
      {
        excludedActionIds: [...excludedActionIds],
        weightsOverride: toWeightsOverride(preferences),
        cityStrategicPreferenceSectors: [...(preferences?.sectors ?? [])],
        cityStrategicPreferenceTimeframes:
          timeframes.length > 0 ? [...timeframes] : [...DEFAULT_TIMEFRAMES],
        cityStrategicPreferenceCoBenefitKeys: [
          ...(preferences?.strategicPriorities ?? []),
        ],
      },
    ],
  };
}
