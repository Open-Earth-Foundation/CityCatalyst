/**
 * I.4.4 is energy generation supplied to the grid. The row is stored so a
 * territorial total can use it later. BASIC and BASIC+ totals leave it out,
 * otherwise those tonnes are counted again with scope 2 grid electricity.
 */
export const GRID_GENERATION_GPC_REF = "I.4.4";

/** SQL predicate for a trusted column name. Not for user input. */
export function sqlOmitGridGeneration(column = "gpc_reference_number"): string {
  return `COALESCE(${column}, '') <> '${GRID_GENERATION_GPC_REF}'`;
}
