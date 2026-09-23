import { describe, expect, it } from "@jest/globals";

import { financeFacts } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/financeFacts";
import {
  countSelfDeliverable,
  formatClpAmount,
  fundAccessLabelKey,
  isSelfFundable,
  profileAttrs,
  routeKeyOf,
  SCORE_LEVEL_META,
  scoreLevel,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/labels";
import type { FeasibilityRow } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/types";

function row(id: string, route: string | null): FeasibilityRow {
  return { action_id: id, financial_feasibility: 0.5, route };
}

// The five `route` strings the Global API feasibility endpoint emits.
const API_ROUTES = {
  self: "self-deliverable",
  ownBudget: "own-budget feasible",
  technicalAssistance: "needs technical assistance",
  cofinance: "needs external co-finance",
  support: "needs external finance + TA / pooling",
} as const;

describe("routeKeyOf", () => {
  it("keeps every endpoint route distinct", () => {
    for (const [key, route] of Object.entries(API_ROUTES)) {
      expect(routeKeyOf(route)).toBe(key);
    }
  });

  it("does not guess a route the endpoint did not give", () => {
    expect(routeKeyOf(null)).toBe("other");
    expect(routeKeyOf("something new")).toBe("other");
  });

  it("treats only the two own-budget routes as self-fundable", () => {
    expect(isSelfFundable(API_ROUTES.self)).toBe(true);
    expect(isSelfFundable(API_ROUTES.ownBudget)).toBe(true);
    expect(isSelfFundable(API_ROUTES.technicalAssistance)).toBe(false);
    expect(isSelfFundable(API_ROUTES.cofinance)).toBe(false);
    expect(isSelfFundable(API_ROUTES.support)).toBe(false);
  });
});

describe("financeFacts", () => {
  it("counts actions per financing route without merging routes", () => {
    const rows = [
      row("a", API_ROUTES.self),
      row("b", API_ROUTES.ownBudget),
      row("c", API_ROUTES.ownBudget),
      row("d", API_ROUTES.technicalAssistance),
      row("e", API_ROUTES.cofinance),
      row("f", API_ROUTES.support),
      row("g", null),
    ];
    expect(financeFacts(rows)).toMatchObject({
      total: 7,
      self: 1,
      ownBudget: 2,
      technicalAssistance: 1,
      cofinance: 1,
      support: 1,
      externalFinance: 2,
      other: 1,
    });
    expect(countSelfDeliverable(rows)).toBe(1);
  });

  it("is all zeros for an empty catalog", () => {
    expect(financeFacts([])).toMatchObject({ total: 0, self: 0, cofinance: 0 });
  });
});

describe("profileAttrs", () => {
  it("labels each upstream archetype by its own name", () => {
    expect(profileAttrs("Self-sufficient").labelKey).toBe(
      "profile-self-sufficient",
    );
    expect(profileAttrs("Delivery-ready").labelKey).toBe(
      "profile-delivery-ready",
    );
    expect(profileAttrs("Well-resourced").labelKey).toBe(
      "profile-well-resourced",
    );
    expect(profileAttrs("Support-ready").labelKey).toBe(
      "profile-support-ready",
    );
  });

  it("claims nothing when the endpoint has no profile", () => {
    expect(profileAttrs(null)).toEqual({
      labelKey: "profile-unknown",
      descKey: "profile-unknown-desc",
    });
  });
});

describe("fundAccessLabelKey", () => {
  it("follows inputs.finance.fund_access", () => {
    expect(fundAccessLabelKey("direct")).toBe("fund-access-direct");
    expect(fundAccessLabelKey("competitive")).toBe("fund-access-competitive");
    expect(fundAccessLabelKey(undefined)).toBe("fund-access-count");
  });
});

describe("formatClpAmount", () => {
  const t = ((key: string, opts: { value: string | number }) =>
    `${key}:${opts.value}`) as never;

  it("scales by the row's amount_unit", () => {
    expect(formatClpAmount(6_000_000, "CLP_thousands", t)).toBe(
      "amount-clp-b:6.0",
    );
    expect(formatClpAmount(6_000, "CLP_millions", t)).toBe("amount-clp-b:6.0");
    expect(formatClpAmount(500, "CLP_thousands", t)).toBe("amount-clp-k:500");
  });

  it("shows nothing rather than guess an unknown unit", () => {
    expect(formatClpAmount(100, "USD", t)).toBeNull();
    expect(formatClpAmount(100, null, t)).toBeNull();
    expect(formatClpAmount(null, "CLP_thousands", t)).toBeNull();
  });
});

describe("scoreLevel", () => {
  it("bands every score the endpoint emits on the four-level scale", () => {
    const levels = [1, 0.85, 0.7, 0.6, 0.45, 0.35, 0.3].map((v) => [
      v,
      SCORE_LEVEL_META[scoreLevel(v)].tone,
    ]);
    expect(levels).toEqual([
      [1, "positive"],
      [0.85, "positive"],
      [0.7, "positive"],
      [0.6, "warning"],
      [0.45, "caution"],
      [0.35, "negative"],
      [0.3, "negative"],
    ]);
  });
});
