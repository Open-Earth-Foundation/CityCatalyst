"use client";
import type { TFunction } from "i18next";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import { ROUTE_META, type RouteKey } from "../labels";

export interface RouteTagProps {
  routeKey: RouteKey;
  t: TFunction;
}

/**
 * The financing-route pill. `flexShrink={0}` is what keeps "Self-deliverable"
 * from collapsing to "Self…" inside the (nowrap) route column.
 */
export function RouteTag({ routeKey, t }: RouteTagProps) {
  return (
    <MeedStatusTag tone={ROUTE_META[routeKey].tone} flexShrink={0}>
      {t(ROUTE_META[routeKey].labelKey)}
    </MeedStatusTag>
  );
}
