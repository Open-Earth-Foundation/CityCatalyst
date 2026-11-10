import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";

import { toMeedPrioritizeCityResult } from "@/app/[lng]/cities/[cityId]/MEED/meedRankingAdapter";
import { deriveLegalScreening } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/regulations/legalScreening";
import {
  excludedActionCount,
  readRankingWeights,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/rankingFacts";
import type { MeedActionIndex } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/actionCatalog";

/** A real response from the ranking route, kept verbatim. */
const RESPONSE = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "tests/fixtures/meed-rank-response.json"),
    "utf-8",
  ),
);

const adapted = toMeedPrioritizeCityResult(RESPONSE, { locode: "BR SAO" });

describe("MEED ranking adapter", () => {
  it("unwraps the envelope and renames every scored field", () => {
    const first = adapted.ranked_actions![0];
    expect(first).toMatchObject({
      action_id: "ipcc_0052",
      rank: 1,
      final_score: 0.6380092800609104,
      impact_score: 0.6263059637471097,
      alignment_score: 0.6097250000000001,
      feasibility_score: 0.69305,
    });
    expect(first.explanations?.en).toContain("land subsector");
    // No camelCase leaks through onto the internal shape.
    expect(Object.keys(first)).not.toContain("finalScore");
  });

  it("passes evidence_summary through untouched — it is already snake_case", () => {
    const legal = (adapted.ranked_actions![0].evidence_summary as any)
      .feasibility.legal;
    expect(legal.component_source).toBe("neutral_fallback");
    expect(legal).toHaveProperty("assessment_missing");
  });

  it("carries the locode the caller supplies, since the response has none", () => {
    expect(adapted.locode).toBe("BR SAO");
    expect(toMeedPrioritizeCityResult(RESPONSE).locode).toBe("");
  });

  it("sorts by rank whatever order the rows arrive in", () => {
    const shuffled = {
      data: {
        rankedActions: [
          { actionId: "c", rank: 3 },
          { actionId: "a", rank: 1 },
          { actionId: "b", rank: 2 },
        ],
      },
    };
    expect(
      toMeedPrioritizeCityResult(shuffled).ranked_actions!.map(
        (a) => a.action_id,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("sorts rank-less rows last instead of letting them take first place", () => {
    const partial = {
      data: {
        rankedActions: [{ actionId: "none" }, { actionId: "first", rank: 1 }],
      },
    };
    expect(
      toMeedPrioritizeCityResult(partial).ranked_actions!.map(
        (a) => a.action_id,
      ),
    ).toEqual(["first", "none"]);
  });

  it("mirrors ranked_action_ids onto the sorted order", () => {
    expect(adapted.ranked_action_ids).toEqual(
      adapted.ranked_actions!.map((a) => a.action_id),
    );
  });
});

describe("MEED ranking adapter — removed actions", () => {
  it("carries the multilingual legal fields across as maps", () => {
    const removed = adapted.removed_actions!.find(
      (r) => r.action_id === "icare_0008",
    )!;
    const source = RESPONSE.data.removedActions.find(
      (r: any) => r.actionId === "icare_0008",
    );

    expect(removed.removal_source).toBe("legal_hard_filter");
    expect(removed.action_name).toBe(source.actionName);
    // Language maps are carried across whole, not split per language.
    expect(removed.legal?.ownershipDescription).toEqual(
      source.ownershipDescription,
    );
    expect(removed.legal?.restrictionsDescription).toEqual(
      source.restrictionsDescription,
    );
    expect(removed.legal?.legalJustification).toEqual(
      source.legalJustification,
    );
    expect(removed.legal?.legalReferences).toHaveLength(5);
  });

  it("counts only legal removals as discarded_legal", () => {
    expect(adapted.metadata?.counts?.discarded_legal).toBe(19);
    expect(excludedActionCount(adapted)).toBe(19);

    const mixed = {
      data: {
        removedActions: [
          { actionId: "a", removalSource: "legal_hard_filter" },
          { actionId: "b", removalSource: "user_exclusion" },
          { actionId: "c", removalSource: "user_exclusion" },
        ],
      },
    };
    const counts = toMeedPrioritizeCityResult(mixed).metadata!.counts!;
    expect(counts.discarded_legal).toBe(1);
    expect(counts.discarded_excluded).toBe(2);
  });

  it("publishes no count it cannot derive from a top-N response", () => {
    const counts = adapted.metadata!.counts!;
    expect(counts.ranked_actions).toBe(5);
    expect(counts.total_actions).toBeUndefined();
    expect(counts.valid_actions).toBeUndefined();
  });
});

describe("MEED ranking adapter — downstream consumers", () => {
  it("lifts the resolved weights to where the results screen reads them", () => {
    expect(adapted.metadata?.weights).toEqual({
      impact: 0.55,
      alignment: 0.22,
      feasibility: 0.23,
    });
    expect(readRankingWeights(adapted)).toEqual({
      impact: 0.55,
      alignment: 0.22,
      feasibility: 0.23,
    });
  });

  it("reports no weights rather than assumed ones when the response omits them", () => {
    expect(readRankingWeights(null)).toBeNull();
    expect(
      readRankingWeights({
        ...adapted,
        metadata: { ...adapted.metadata, weights: undefined },
      }),
    ).toBeNull();
  });

  it("rebuilds the hard-filter evidence map the regulations screen needs", () => {
    const map = adapted.metadata?.hard_filter_evidence_by_action_id;
    expect(Object.keys(map ?? {})).toHaveLength(5);
    // This fixture reports an assessment for every ranked action, so nothing is
    // flagged — the map still has to exist for screening to count as having run.
    expect(map?.ipcc_0052?.legal_assessment_present).toBe(true);
  });

  it("groups a kept action without a legal assessment as not assessed", () => {
    const payload = {
      data: {
        rankedActions: [
          {
            actionId: "kept_but_unassessed",
            rank: 1,
            evidenceSummary: {
              feasibility: {
                legal: { assessment_missing: true, assessment_present: false },
              },
            },
          },
        ],
      },
    };
    const screening = deriveLegalScreening(
      toMeedPrioritizeCityResult(payload),
      new Map() as MeedActionIndex,
    );
    expect(screening.groups.not_assessed.map((f) => f.actionId)).toEqual([
      "kept_but_unassessed",
    ]);
    expect(screening.isEmpty).toBe(false);
  });

  it("groups ranked actions by municipal authority", () => {
    const screening = deriveLegalScreening(
      adapted,
      new Map() as MeedActionIndex,
    );
    expect(screening.isEmpty).toBe(false);
    expect(screening.includedCount).toBe(5);
    expect(screening.groups.blocked.map((a) => a.actionId)).toEqual([
      "ipcc_0053",
    ]);
    expect(screening.groups.conditional).toHaveLength(1);
    expect(screening.groups.enabled).toHaveLength(1);
    expect(screening.groups.not_assessed).toHaveLength(2);
    const blocked = screening.groups.blocked[0];
    expect(blocked.rank).toBe(2);
    expect(blocked.standing?.verdict).toBe("conditional");
    expect(blocked.standing?.score).toBe(0);
    expect(blocked.standing?.justification).toContain("18.695");
    // The map the adapter rebuilds carries the same ownership.
    expect(
      adapted.metadata?.hard_filter_evidence_by_action_id?.ipcc_0053
        ?.legal_ownership_category,
    ).toBe("blocked");
  });

  it("keeps actions the backend removed before scoring, with their reasons", () => {
    const screening = deriveLegalScreening(
      adapted,
      new Map() as MeedActionIndex,
    );
    expect(screening.excludedBeforeScoring).toHaveLength(19);

    const blocked = screening.excludedBeforeScoring.find(
      (b) => b.actionId === "icare_0008",
    )!;
    // Falls back to the response's own name when the catalog is not loaded.
    expect(blocked.actionName).toContain("smart grid");
    expect(blocked.removalReason).toBe("legal_verdict_blocked");
    expect(blocked.reasons?.[0]).toContain("Regulation of electrical networks");
  });
});

describe("MEED ranking adapter — malformed input", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "nope"],
    ["an empty object", {}],
    ["an empty envelope", { data: {} }],
    [
      "wrong-typed arrays",
      { data: { rankedActions: 3, removedActions: null } },
    ],
  ])("survives %s", (_label, payload) => {
    const result = toMeedPrioritizeCityResult(payload);
    expect(result.ranked_actions).toEqual([]);
    expect(result.removed_actions).toEqual([]);
    expect(result.metadata?.counts?.ranked_actions).toBe(0);
  });

  it("drops rows with no action ID rather than emitting undefined keys", () => {
    const payload = {
      data: {
        rankedActions: [{ rank: 1 }, { actionId: "real", rank: 2 }, null],
        removedActions: [{ actionName: "orphan" }],
      },
    };
    const result = toMeedPrioritizeCityResult(payload);
    expect(result.ranked_actions!.map((a) => a.action_id)).toEqual(["real"]);
    expect(result.removed_actions).toEqual([]);
  });

  it("omits the legal block entirely when no evidence came back", () => {
    const payload = {
      data: {
        removedActions: [{ actionId: "bare", removalSource: "user_exclusion" }],
      },
    };
    expect(
      toMeedPrioritizeCityResult(payload).removed_actions![0].legal,
    ).toBeUndefined();
  });
});
