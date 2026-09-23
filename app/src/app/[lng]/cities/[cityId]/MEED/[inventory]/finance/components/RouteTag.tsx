"use client";
import type { TFunction } from "i18next";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import { ROUTE_META, humanizeEnum, type RouteKey } from "../labels";

export interface RouteTagProps {
  routeKey: RouteKey;
  /** Raw endpoint route, shown as-is when it maps to no known key. */
  route?: string | null;
  t: TFunction;
}

/**
 * The financing-route pill. `flexShrink={0}` is what keeps "Self-deliverable"
 * from collapsing to "Self…" inside the (nowrap) route column.
 */
export function RouteTag({ routeKey, route, t }: RouteTagProps) {
  return (
    <MeedStatusTag tone={ROUTE_META[routeKey].tone} flexShrink={0}>
      {routeKey === "other" && route
        ? humanizeEnum(route)
        : t(ROUTE_META[routeKey].labelKey)}
    </MeedStatusTag>
  );
}
