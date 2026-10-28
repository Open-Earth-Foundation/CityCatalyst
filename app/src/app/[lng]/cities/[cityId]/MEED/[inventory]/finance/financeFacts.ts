import { routeKeyOf, type RouteKey } from "./labels";
import type { FeasibilityRow } from "./types";

/** Headline counts the finance page and the context cards both quote. */
export interface MeedFinanceFacts {
  total: number;
  /** "self-deliverable". */
  self: number;
  /** "own-budget feasible". */
  ownBudget: number;
  /** "needs technical assistance": capacity is the constraint, not money. */
  technicalAssistance: number;
  /** "needs external co-finance". */
  cofinance: number;
  /** "needs external finance + TA / pooling". */
  support: number;
  /** cofinance + support: every route that needs external finance. */
  externalFinance: number;
  other: number;
  byRoute: Partial<Record<RouteKey, number>>;
}

export function financeFacts(rows: FeasibilityRow[]): MeedFinanceFacts {
  const byRoute: Partial<Record<RouteKey, number>> = {};
  for (const row of rows) {
    const key = routeKeyOf(row.route);
    byRoute[key] = (byRoute[key] ?? 0) + 1;
  }
  return {
    total: rows.length,
    self: byRoute.self ?? 0,
    ownBudget: byRoute.ownBudget ?? 0,
    technicalAssistance: byRoute.technicalAssistance ?? 0,
    cofinance: byRoute.cofinance ?? 0,
    support: byRoute.support ?? 0,
    externalFinance: (byRoute.cofinance ?? 0) + (byRoute.support ?? 0),
    other: byRoute.other ?? 0,
    byRoute,
  };
}
