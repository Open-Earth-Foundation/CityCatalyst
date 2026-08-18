import type { MeedSectionStates } from "./meedStatus";

/**
 * Whether the city has enough input to produce a meaningful ranking, and — just
 * as importantly — one sentence explaining what is missing.
 *
 * There is exactly one implementation so the overview and the pre-flight screen
 * can never disagree about why the button is disabled. The sentence is always
 * rendered next to the button, never hidden in a tooltip.
 */
export interface MeedGate {
  canGenerate: boolean;
  /** i18n key in the `meed` namespace. */
  reasonKey: string;
  /** Interpolation values for `reasonKey`. */
  reasonValues?: Record<string, number>;
  tone: "negative" | "warning" | "positive";
  /** Step keys the user still needs to visit, for "fix this" links. */
  missing: string[];
}

/** Emissions is the only hard requirement — it drives the impact score. */
const REQUIRED_STEP = "emissions";
const MIN_COMPLETE_SECTIONS = 3;

export function computeMeedGate(states: MeedSectionStates): MeedGate {
  const values = Object.values(states);
  const emissions = states[REQUIRED_STEP];
  const emissionsReady =
    emissions?.status === "complete" ||
    emissions?.status === "needs-review" ||
    emissions?.status === "in-progress";

  if (!emissionsReady) {
    return {
      canGenerate: false,
      reasonKey: "gate-emissions-required",
      tone: "negative",
      missing: [REQUIRED_STEP],
    };
  }

  const settled = values.filter(
    (s) => s.status === "complete" || s.status === "needs-review",
  );

  if (settled.length < MIN_COMPLETE_SECTIONS) {
    // Name the sections rather than only counting them. "2 more sections
    // needed" tells the user nothing actionable — they still have to work out
    // which ones, from six cards that all look equally unfinished.
    const outstanding = values
      .filter((s) => s.status !== "complete" && s.status !== "needs-review")
      .map((s) => s.key);
    return {
      canGenerate: false,
      reasonKey: "gate-sections-needed",
      reasonValues: { count: MIN_COMPLETE_SECTIONS - settled.length },
      tone: "warning",
      missing: outstanding,
    };
  }

  return {
    canGenerate: true,
    reasonKey: "gate-ready",
    tone: "positive",
    missing: [],
  };
}
