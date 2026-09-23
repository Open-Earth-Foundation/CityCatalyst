import { describe, expect, it } from "@jest/globals";

import {
  legalFunnel,
  scoreContributions,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/rankingFacts";
import type { MeedPrioritizeCityResult } from "@/util/types/meed";

const WEIGHTS = { impact: 0.55, alignment: 0.22, feasibility: 0.23 };

describe("scoreContributions", () => {
  it("multiplies each pillar by its weight and sums them", () => {
    const parts = scoreContributions(
      { impact_score: 0.93, alignment_score: 0.95, feasibility_score: 0.61 },
      WEIGHTS,
    );
    expect(parts.impact).toBeCloseTo(0.5115, 4);
    expect(parts.alignment).toBeCloseTo(0.209, 4);
    expect(parts.feasibility).toBeCloseTo(0.1403, 4);
    expect(parts.total).toBeCloseTo(0.8608, 4);
  });
});

function ranking(
  counts: MeedPrioritizeCityResult["metadata"] extends infer M
    ? M extends { counts?: infer C }
      ? C
      : never
    : never,
  rankedCount = 20,
): MeedPrioritizeCityResult {
  return {
    locode: "CL ANF",
    ranked_actions: Array.from({ length: rankedCount }, (_, i) => ({
      action_id: `a${i}`,
      rank: i + 1,
      final_score: 0.5,
      impact_score: 0.5,
      alignment_score: 0.5,
      feasibility_score: 0.5,
    })),
    metadata: { counts },
  };
}

describe("legalFunnel", () => {
  it("returns null without a ranking", () => {
    expect(legalFunnel(null, 102)).toBeNull();
  });

  it("prefers the response counts", () => {
    expect(
      legalFunnel(ranking({ total_actions: 102, valid_actions: 83 }), 999),
    ).toEqual({ assessed: 102, passed: 83, ranked: 20 });
  });

  it("derives passed from the legal discards when valid_actions is absent", () => {
    expect(legalFunnel(ranking({ discarded_legal: 19 }), 102)).toEqual({
      assessed: 102,
      passed: 83,
      ranked: 20,
    });
  });

  it("returns null when neither count is reported", () => {
    expect(legalFunnel(ranking({}), 102)).toBeNull();
  });

  it("never reports fewer passed than ranked", () => {
    expect(legalFunnel(ranking({ discarded_legal: 90 }, 20), 102)?.passed).toBe(
      20,
    );
  });
});
