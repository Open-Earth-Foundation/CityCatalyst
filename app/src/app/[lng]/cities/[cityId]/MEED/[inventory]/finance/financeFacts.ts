import { routeKeyOf, type RouteKey } from "./labels";
import type { FeasibilityRow } from "./types";

/** Headline counts the finance page and the context cards both quote. */
export interface MeedFinanceFacts {
  total: number;
  /** Route "self": the city can fund and run it alone. */
  self: number;
  /** Route "cofinance": cost exceeds the budget, outside funds close the gap. */
  cofinance: number;
  /** Route "support": needs finance plus expertise. */
  support: number;
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
    cofinance: byRoute.cofinance ?? 0,
    support: byRoute.support ?? 0,
    other: byRoute.other ?? 0,
    byRoute,
  };
}
