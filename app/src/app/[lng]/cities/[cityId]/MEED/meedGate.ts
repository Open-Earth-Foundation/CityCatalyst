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

/**
 * Inputs the city actually supplies. Legal screening, policy alignment,
 * financial feasibility and socioeconomic context are computed by the model,
 * so counting them here rewarded opening a read-only page and told the user
 * nothing about whether the ranking would be any good.
 */
const SCORED_INPUTS = ["emissions", "preferences"];

export function computeMeedGate(states: MeedSectionStates): MeedGate {
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

  const outstanding = SCORED_INPUTS.filter((key) => {
    const status = states[key]?.status;
    return status !== "complete" && status !== "needs-review";
  });

  if (outstanding.length > 0) {
    // Name what is missing rather than only counting it — with two inputs,
    // a count tells the user nothing a name would not tell them better.
    return {
      canGenerate: false,
      reasonKey: "gate-sections-needed",
      reasonValues: { count: outstanding.length },
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
