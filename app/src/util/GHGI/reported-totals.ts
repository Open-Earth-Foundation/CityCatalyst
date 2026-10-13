/**
 * Some stored rows are excluded from BASIC and BASIC+ totals. I.4.4 (energy
 * generation supplied to the grid) is the current case: it stays on the
 * inventory for a territorial total, and is not counted again with scope 2
 * grid electricity. Totals check this flag rather than a GPC reference.
 */
export const GRID_GENERATION_GPC_REF = "I.4.4";

/** SQL predicate for a trusted column name. Not for user input. */
export function sqlOmitFromTotal(column = "omit_from_total"): string {
  return `${column} = false`;
}
