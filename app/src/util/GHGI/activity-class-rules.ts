import { normalizeSectorAndSubsector, refForScope } from "@/util/GHGI/gpc-ref-resolver";

/**
 * What an extracted PDF row measures, decided by the model from the row label,
 * table title and section. Later code derives the GPC scope from it.
 */
export const ACTIVITY_CLASSES = [
  "fuel_combustion",
  "grid_energy",
  "td_losses",
  "grid_supply",
  "industrial_process",
  "product_use",
  "other",
] as const;

export type ActivityClass = (typeof ACTIVITY_CLASSES)[number];

export function isActivityClass(value: unknown): value is ActivityClass {
  return (
    typeof value === "string" &&
    (ACTIVITY_CLASSES as readonly string[]).includes(value)
  );
}

export interface ClassifiableRow {
  sector: string | null;
  subsector: string | null;
  scope?: string | null;
  originalScope?: string | null;
  gpcRefNo?: string | null;
  refSource?: "document" | "inferred" | null;
  activityClass?: ActivityClass | null;
  scopeSource?: "document" | "inferred" | null;
}

const LOSS_OR_CONSUMPTION =
  /\b(loss(es)?|consumption|perdas?|p[ée]rdidas?|consumo)\b/i;

/** True when any label says the row is about losses or consumption. */
export function hasLossOrConsumptionLabel(
  ...labels: (string | null | undefined)[]
): boolean {
  return labels.some((label) => !!label && LOSS_OR_CONSUMPTION.test(label));
}

function gridReference(
  row: ClassifiableRow,
  scope: 2 | 3,
): string | null {
  const sector = row.sector ?? "";
  const subsector = row.subsector ?? "";
  const { subsectorSlug } = normalizeSectorAndSubsector(sector, subsector);
  const own = refForScope(sector, subsector, scope);
  const usable =
    subsectorSlug !== "energy-industries" &&
    !row.gpcRefNo?.startsWith("I.4.") &&
    own !== null;
  return usable ? own : refForScope("stationary-energy", "non-specified-sources", scope);
}

function applyToRow<T extends ClassifiableRow>(row: T): T {
  if (!("activityClass" in row)) return row;
  if (row.refSource === "document") {
    return row.scope && row.scopeSource !== "document"
      ? { ...row, scopeSource: "document" }
      : row;
  }
  let next: T = row;
  const set = (fields: Partial<ClassifiableRow>): void => {
    next = { ...next, ...fields };
  };

  switch (row.activityClass) {
    case "grid_energy":
    case "td_losses": {
      const scope = row.activityClass === "grid_energy" ? 2 : 3;
      const ref = gridReference(row, scope);
      if (ref) {
        set({ gpcRefNo: ref, scope: String(scope), scopeSource: "inferred" });
      }
      break;
    }
    case "product_use":
    case "industrial_process": {
      const { sectorSlug } = normalizeSectorAndSubsector(
        row.sector ?? "",
        row.subsector ?? "",
      );
      if (
        sectorSlug === "industrial-processes-and-product-uses-ippu" ||
        row.gpcRefNo?.startsWith("IV.")
      ) {
        set({
          gpcRefNo: row.activityClass === "product_use" ? "IV.2" : "IV.1",
          scope: "1",
        });
        if (row.scope !== "1") set({ scopeSource: "inferred" });
      }
      break;
    }
    case "grid_supply":
      set({ gpcRefNo: "I.4.4" });
      break;
  }

  return next;
}

/**
 * Derives reference and scope from the activity class for rows whose reference
 * the document does not print. Pure: returns new objects only for changed rows.
 */
export function applyActivityClassRules<T extends ClassifiableRow>(
  rows: T[],
): T[] {
  return rows.map(applyToRow);
}
