/**
 * CC-1311: when one import has both a subsector-level row (no subcategory,
 * for example `I.3`) and child rows of that subsector (`I.3.x`), the children
 * are kept and the subsector row is dropped, so the amount is not counted
 * twice. The gap between the two is reported, never stored as a value.
 */

export interface ResolvedRowRef {
  /** Position of the row in the caller's list. */
  index: number;
  subsectorId: string;
  subcategoryId: string | null;
  /** CO2e in tonnes, after the caller's unit and gas conversion. */
  co2eq: number | null;
  notationKey: string | null;
}

export interface ParentSuperseded {
  index: number;
  parentValue: number | null;
  /** Sum of children with a value; null when every child is a notation key. */
  childrenSum: number | null;
  childrenCount: number;
  gap: number | null;
  severity: "info" | "warning";
}

export const PARENT_GAP_RELATIVE = 0.01;
export const PARENT_GAP_ABSOLUTE_T = 1;

export function supersedeParentRows(
  rows: ResolvedRowRef[],
): ParentSuperseded[] {
  const bySubsector = new Map<string, ResolvedRowRef[]>();
  for (const row of rows) {
    const group = bySubsector.get(row.subsectorId) ?? [];
    group.push(row);
    bySubsector.set(row.subsectorId, group);
  }

  const superseded: ParentSuperseded[] = [];
  for (const group of bySubsector.values()) {
    const children = group.filter((row) => row.subcategoryId !== null);
    if (children.length === 0) continue;

    const valued = children.filter((row) => row.co2eq !== null);
    const childrenSum = valued.length
      ? valued.reduce((sum, row) => sum + (row.co2eq as number), 0)
      : null;

    for (const parent of group.filter((row) => row.subcategoryId === null)) {
      const parentValue = parent.co2eq;
      // Children that are all notation keys cannot replace a value.
      if (parentValue !== null && childrenSum === null) continue;
      const gap =
        parentValue !== null && childrenSum !== null
          ? parentValue - childrenSum
          : null;
      const tolerance =
        parentValue !== null
          ? Math.max(
              PARENT_GAP_RELATIVE * Math.abs(parentValue),
              PARENT_GAP_ABSOLUTE_T,
            )
          : 0;
      superseded.push({
        index: parent.index,
        parentValue,
        childrenSum,
        childrenCount: children.length,
        gap,
        severity:
          gap !== null && Math.abs(gap) > tolerance ? "warning" : "info",
      });
    }
  }
  return superseded.sort((a, b) => a.index - b.index);
}
