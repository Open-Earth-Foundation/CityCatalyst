/**
 * Some stored rows are excluded from BASIC and BASIC+ totals. They stay on the
 * inventory and in detailed views. Totals check this flag rather than a GPC
 * reference.
 *
 * I.4.4 (energy generation supplied to the grid) stays for a territorial total,
 * and is not counted again with scope 2 grid electricity.
 */
export const GRID_GENERATION_GPC_REF = "I.4.4";

/**
 * References the GPC leaves out of BASIC and BASIC+. III.x.3 is waste generated
 * outside the city and treated inside it: it still counts in a territorial
 * scope 1 total. VI.1 is Other Scope 3. Exact references, never a prefix:
 * III.x.1 and III.x.2 count.
 */
const OMITTED_FROM_TOTAL_GPC_REFS: ReadonlySet<string> = new Set([
  GRID_GENERATION_GPC_REF,
  "III.1.3",
  "III.2.3",
  "III.3.3",
  "III.4.3",
  "VI.1",
]);

/**
 * III.x.3 rows are optional. Sector III requires scope 1, so these references
 * stay out of inventory progress and required-row lists.
 */
const IMPORTED_WASTE_GPC_REFS: ReadonlySet<string> = new Set([
  "III.1.3",
  "III.2.3",
  "III.3.3",
  "III.4.3",
]);

export function isImportedWasteRef(
  gpcReferenceNumber?: string | null,
): boolean {
  return (
    gpcReferenceNumber != null &&
    IMPORTED_WASTE_GPC_REFS.has(gpcReferenceNumber)
  );
}

export function isOmittedGPCReference(
  gpcReferenceNumber?: string | null,
): boolean {
  return (
    gpcReferenceNumber != null &&
    OMITTED_FROM_TOTAL_GPC_REFS.has(gpcReferenceNumber)
  );
}

/** True when a sector breakdown has nothing to show, counted or omitted. */
export function isBreakdownEmpty(
  breakdown?: {
    byActivity?: object;
    byScope?: unknown[];
    omittedFromTotal?: unknown[];
  } | null,
): boolean {
  return (
    Object.keys(breakdown?.byActivity ?? {}).length === 0 &&
    (breakdown?.byScope ?? []).length === 0 &&
    (breakdown?.omittedFromTotal ?? []).length === 0
  );
}

/** SQL predicate for a trusted column name. Not for user input. */
export function sqlOmitFromTotal(column = "omit_from_total"): string {
  return `${column} = false`;
}
