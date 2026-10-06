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

/** Only `en` locale files exist for MEED, so only `en` is worth requesting. */
const REQUESTED_LANGUAGES = ["en"];

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
  topN?: number;
}

export function buildRunRankingRequest({
  inventoryId,
  preferences,
  excludedActionIds,
  topN = DEFAULT_TOP_N,
}: BuildRunRankingRequestParams): MeedRunRankingRequest {
  const timeframes = preferences?.timeline ?? [];

  return {
    inventoryId,
    requestedLanguages: [...REQUESTED_LANGUAGES],
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
