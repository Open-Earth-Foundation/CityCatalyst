import { describe, expect, it } from "@jest/globals";

import { financeFacts } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/financeFacts";
import { routeKeyOf } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/labels";
import type { FeasibilityRow } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/types";

function row(id: string, route: string | null): FeasibilityRow {
  return { action_id: id, financial_feasibility: 0.5, route };
}

describe("financeFacts", () => {
  it("counts actions per financing route", () => {
    const rows = [
      row("a", "self_deliverable"),
      row("b", "self_deliverable"),
      row("c", "needs_cofinance"),
      row("d", null),
    ];
    const facts = financeFacts(rows);
    expect(facts.total).toBe(4);
    expect(facts.self + facts.cofinance + facts.support + facts.other).toBe(4);
    // Whatever the raw strings map to, the buckets match routeKeyOf.
    for (const r of rows) {
      const key = routeKeyOf(r.route);
      expect(facts.byRoute[key]).toBeGreaterThan(0);
    }
  });

  it("is all zeros for an empty catalog", () => {
    expect(financeFacts([])).toMatchObject({ total: 0, self: 0, cofinance: 0 });
  });
});
