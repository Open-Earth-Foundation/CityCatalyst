import {
  countByOwnership,
  LEGAL_CATEGORY_ORDER,
  legalCategoryLabelKey,
  legalStandingByAction,
  readLegalStanding,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/regulations/legalStanding";
import type { MeedRankedActionResult } from "@/util/types/meed";

function ranked(
  actionId: string,
  legal: Record<string, unknown> | null,
): MeedRankedActionResult {
  return {
    action_id: actionId,
    rank: 1,
    final_score: 0.5,
    impact_score: 0.5,
    alignment_score: 0.5,
    feasibility_score: 0.5,
    evidence_summary: legal === null ? {} : { feasibility: { legal } },
  } as MeedRankedActionResult;
}

describe("MEED legal standing", () => {
  it("reads ownership and verdict one-to-one from the legal block", () => {
    const standing = readLegalStanding(
      ranked("a", {
        ownership_category: "Blocked",
        verdict_category: "conditional",
        component_score: 0,
        component_source: "assessment",
        legal_justification: { es: "Ley 18.695", en: "Law 18.695" },
        legal_references: ["Ley 18.695 art. 4", 7],
      }),
      "es",
    );
    expect(standing).toMatchObject({
      actionId: "a",
      ownership: "blocked",
      verdict: "conditional",
      score: 0,
      source: "assessment",
      justification: "Ley 18.695",
      references: ["Ley 18.695 art. 4"],
    });
  });

  it("treats a missing or unknown category as not assessed", () => {
    expect(
      readLegalStanding(ranked("a", { ownership_category: null }))?.ownership,
    ).toBe("not_assessed");
    expect(
      readLegalStanding(ranked("a", { ownership_category: "partial" }))
        ?.ownership,
    ).toBe("not_assessed");
    expect(readLegalStanding(ranked("a", null))).toBeNull();
  });

  it("accepts the older flat justification fields", () => {
    const legal = {
      legal_justification: "Texto nativo",
      legal_justification_en: "Native text",
      ownership_description: "English",
      ownership_description_es: "Español",
    };
    expect(readLegalStanding(ranked("a", legal), "en")).toMatchObject({
      justification: "Native text",
      ownershipDescription: "English",
    });
    expect(readLegalStanding(ranked("a", legal), "es")).toMatchObject({
      justification: "Texto nativo",
      ownershipDescription: "Español",
    });
  });

  it("counts ranked actions per ownership category", () => {
    const map = legalStandingByAction([
      ranked("a", { ownership_category: "enabled" }),
      ranked("b", { ownership_category: "blocked" }),
      ranked("c", { ownership_category: "blocked" }),
      ranked("d", null),
    ]);
    expect(map.size).toBe(3);
    expect(countByOwnership(map.values())).toEqual({
      enabled: 1,
      conditional: 0,
      blocked: 2,
      not_assessed: 0,
    });
  });

  it("orders what needs attention first and keys labels by category", () => {
    expect(LEGAL_CATEGORY_ORDER).toEqual([
      "blocked",
      "conditional",
      "enabled",
      "not_assessed",
    ]);
    expect(legalCategoryLabelKey("not_assessed")).toBe("legal-not-assessed");
  });
});
