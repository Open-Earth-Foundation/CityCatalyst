import { describe, expect, it } from "@jest/globals";

import {
  ADAPTATION_ACTIONS,
  ACTION_BY_ID,
} from "@/app/[lng]/public/hiap-brazil-demo/_lib/actions";
import {
  CITIES,
  CITY_BY_SLUG,
} from "@/app/[lng]/public/hiap-brazil-demo/_lib/cities";
import {
  RISK_CELLS,
  RISK_CELL_BY_KEY,
} from "@/app/[lng]/public/hiap-brazil-demo/_lib/riskCells";
import { EMPTY_PREFERENCES } from "@/app/[lng]/public/hiap-brazil-demo/_lib/state";
import {
  cellImpacts,
  componentScore,
  rankAdaptation,
  toRankedResults,
} from "@/app/[lng]/public/hiap-brazil-demo/_lib/ranking";
import { fundingResult } from "@/app/[lng]/public/hiap-brazil-demo/_lib/finance";
import { suppressedCoBenefits } from "@/app/[lng]/public/hiap-brazil-demo/_lib/coBenefits";
import { adaptationIndex } from "@/app/[lng]/public/hiap-brazil-demo/_lib/catalog";
import {
  MITIGATION_SHIFTS,
  mitigationRanked,
} from "@/app/[lng]/public/hiap-brazil-demo/_lib/mitigation";

// The fixtures are hand-written; these checks are what stops a typo from
// producing a screen that quietly shows the wrong thing.
describe("fixture integrity", () => {
  it("every relationship points at an action in the bank", () => {
    for (const action of ADAPTATION_ACTIONS) {
      for (const rel of action.relationships) {
        expect(ACTION_BY_ID[rel.actionId]).toBeDefined();
      }
    }
  });

  it("every risk link names a known cell, and only direct links carry an effectiveness", () => {
    for (const action of ADAPTATION_ACTIONS) {
      for (const link of action.links) {
        expect(RISK_CELL_BY_KEY[link.cell]).toBeDefined();
        if (link.directness === "direct") {
          expect(link.effectiveness).toBeDefined();
          expect(link.confidence).toBeDefined();
        }
      }
    }
  });

  it("uncovered-hazard actions have no scoreable link", () => {
    for (const action of ADAPTATION_ACTIONS.filter((a) => a.uncoveredHazard)) {
      expect(
        action.links.filter((l) => l.directness === "direct"),
      ).toHaveLength(0);
    }
  });

  it("every city has a reading for every cell", () => {
    for (const city of CITIES) {
      for (const cell of RISK_CELLS) {
        expect(city.risk[cell.key]).toBeDefined();
      }
    }
  });

  it("uses the methodology's stated values", () => {
    // §4.7 worked example.
    const sobral = CITY_BY_SLUG.sobral.risk.water_stress!;
    expect([sobral.hazard, sobral.vulnerability, sobral.exposure]).toEqual([
      0.72, 0.63, 1.0,
    ]);
    const watershed = ACTION_BY_ID.icare_0104;
    const link = watershed.links.find(
      (l) => l.cell === "water_stress" && l.component === "vulnerability",
    )!;
    expect(componentScore(link, watershed)).toBeCloseTo(0.47, 2);
    // §6.2 five-action policy pilot.
    expect(ACTION_BY_ID.c40_0038.policy.score).toBe(81.7);
    expect(ACTION_BY_ID.c40_0048.policy.score).toBe(66.4);
    expect(ACTION_BY_ID.c40_0044.policy.score).toBe(40.0);
    expect(ACTION_BY_ID.c40_0046.policy.score).toBe(19.3);
    expect(ACTION_BY_ID.c40_0051.policy.score).toBe(0);
  });
});

describe("adaptation ranking", () => {
  const rankings = Object.fromEntries(
    CITIES.map((city) => [
      city.slug,
      rankAdaptation(city, ADAPTATION_ACTIONS, EMPTY_PREFERENCES),
    ]),
  );

  it("ranks 1..n with the top action normalised to 1.0 in every city", () => {
    for (const ranking of Object.values(rankings)) {
      expect(ranking.ranked.map((s) => s.rank)).toEqual(
        ranking.ranked.map((_, i) => i + 1),
      );
      expect(ranking.ranked[0].impact).toBeCloseTo(1, 6);
      for (const s of ranking.ranked) {
        expect(s.final).toBeGreaterThan(0);
        expect(s.final).toBeLessThanOrEqual(1);
      }
    }
  });

  it("accounts for every action exactly once", () => {
    for (const ranking of Object.values(rankings)) {
      const ids = [
        ...ranking.ranked.map((s) => s.action.id),
        ...ranking.notRanked.map((n) => n.action.id),
      ];
      expect(new Set(ids).size).toBe(ADAPTATION_ACTIONS.length);
    }
  });

  it("keeps the healthcare action out of Itaubal's ranking (zero malaria vulnerability, §4.8)", () => {
    const itaubal = rankings.itaubal;
    const health = itaubal.notRanked.find((n) => n.action.id === "icare_0088");
    expect(health?.reason).toBe("no_impact_here");
    // …but ranks it elsewhere.
    expect(
      rankings.sobral.ranked.some((s) => s.action.id === "icare_0088"),
    ).toBe(true);
  });

  it("lists sea-level rise and public shading outside coverage everywhere", () => {
    for (const ranking of Object.values(rankings)) {
      const reasons = Object.fromEntries(
        ranking.notRanked.map((n) => [n.action.id, n.reason]),
      );
      expect(reasons.c40_0046).toBe("outside_coverage");
      expect(reasons.c40_0051).toBe("outside_coverage");
      expect(reasons.icare_0176).toBe("complementary");
    }
  });

  it("removes an action the city excludes", () => {
    const ranking = rankAdaptation(CITY_BY_SLUG.sobral, ADAPTATION_ACTIONS, {
      ...EMPTY_PREFERENCES,
      excludedActionIds: ["c40_0048"],
    });
    expect(
      ranking.notRanked.find((n) => n.action.id === "c40_0048")?.reason,
    ).toBe("excluded_by_city");
  });

  it("changes the order when a city prioritises a sector", () => {
    const neutral = rankAdaptation(
      CITY_BY_SLUG.sobral,
      ADAPTATION_ACTIONS,
      EMPTY_PREFERENCES,
    );
    const health = rankAdaptation(CITY_BY_SLUG.sobral, ADAPTATION_ACTIONS, {
      ...EMPTY_PREFERENCES,
      sectors: ["health"],
    });
    const rankOf = (r: typeof neutral, id: string) =>
      r.ranked.find((s) => s.action.id === id)!.rank;
    expect(rankOf(health, "icare_0088")).toBeLessThanOrEqual(
      rankOf(neutral, "icare_0088"),
    );
  });

  it("produces rows the MEED components can read, in both languages", () => {
    const ranking = rankings.sobral;
    for (const lng of ["en", "pt"]) {
      const rows = toRankedResults(ranking, lng);
      const index = adaptationIndex(ADAPTATION_ACTIONS, ranking.city, lng);
      for (const row of rows) {
        expect(index.get(row.action_id)?.actionName).toBeTruthy();
        expect(index.get(row.action_id)?.sectorLabel).toBeTruthy();
        expect(row.explanations?.[lng]).toContain(ranking.city.name);
      }
    }
  });

  it("only credits a cell the city has a non-zero component for", () => {
    const itaubal = CITY_BY_SLUG.itaubal;
    const cells = cellImpacts(ACTION_BY_ID.icare_0088, itaubal);
    // Malaria vulnerability is 0 and the only other link is indirect, so
    // nothing is credited — the §4.8 "zero index eliminates" dynamic.
    expect(cells.find((c) => c.cell === "malaria")?.raw ?? 0).toBe(0);
    expect(cells.every((c) => c.raw === 0)).toBe(true);
    // In Sobral the same action is credited on malaria.
    expect(
      cellImpacts(ACTION_BY_ID.icare_0088, CITY_BY_SLUG.sobral)[0]?.raw,
    ).toBeGreaterThan(0);
  });
});

describe("financing lookup (§5.2.6)", () => {
  it("treats an undeclared CAPAG as 'to verify' with both outcomes", () => {
    const result = fundingResult(
      ACTION_BY_ID.c40_0048,
      CITY_BY_SLUG["santa-cruz"],
    );
    expect(result.credit).toBe("to_verify");
    expect(result.ifCreditNotIndicated).toBeDefined();
  });

  it("calls a low-cost action self-deliverable for a push-strong city", () => {
    expect(
      fundingResult(ACTION_BY_ID.c40_0062, CITY_BY_SLUG["caxias-do-sul"]).gap,
    ).toBe("self_deliverable");
  });

  it("needs co-finance and assistance where credit fails and push is modest", () => {
    expect(fundingResult(ACTION_BY_ID.c40_0048, CITY_BY_SLUG.itaubal).gap).toBe(
      "needs_cofinance_and_ta",
    );
  });
});

describe("co-benefit deduplication (§6.1)", () => {
  it("suppresses water quality for an action credited in the water-stress cell", () => {
    expect(suppressedCoBenefits(ACTION_BY_ID.icare_0104)).toContain(
      "water_quality",
    );
  });
  it("leaves it alone for an action credited elsewhere", () => {
    expect(suppressedCoBenefits(ACTION_BY_ID.c40_0048)).not.toContain(
      "water_quality",
    );
  });
});

describe("mitigation fixture", () => {
  it("ranks every intervention once", () => {
    const rows = mitigationRanked(MITIGATION_SHIFTS);
    const all = MITIGATION_SHIFTS.flatMap((s) =>
      s.interventions.map((i) => i.id),
    );
    expect(rows.map((r) => r.action_id).sort()).toEqual([...all].sort());
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
  });
});
