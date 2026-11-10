import {
  normalizeSectorAndSubsector,
  refForScope,
  scopeFromLabel,
} from "@/util/GHGI/gpc-ref-resolver";

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

/**
 * Reference of a grid row: its own sub-sector at the fixed scope when that is
 * usable, else non-specified sources (I.6.2 / I.6.3). Grid use is never an
 * energy-industry activity. T&D losses belong to stationary energy only: a
 * transport or waste row at scope 3 (II.x.3, III.x.2) is not a loss.
 */
function gridReference(row: ClassifiableRow, scope: 2 | 3): string | null {
  const sector = row.sector ?? "";
  const subsector = row.subsector ?? "";
  const { sectorSlug, subsectorSlug } = normalizeSectorAndSubsector(
    sector,
    subsector,
  );
  const own = refForScope(sector, subsector, scope);
  const usable =
    subsectorSlug !== "energy-industries" &&
    !row.gpcRefNo?.startsWith("I.4.") &&
    (row.activityClass !== "td_losses" || sectorSlug === "stationary-energy") &&
    own !== null;
  return usable
    ? own
    : refForScope("stationary-energy", "non-specified-sources", scope);
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
        set({ gpcRefNo: ref, scope: String(scope) });
        // Inferred only when the rule sets or changes the scope; a model scope
        // that already matches ("2", "Scope 2") is left as the model gave it.
        if (scopeFromLabel(row.scope) !== scope)
          set({ scopeSource: "inferred" });
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
        if (scopeFromLabel(row.scope) !== 1) set({ scopeSource: "inferred" });
      }
      break;
    }
    case "grid_supply": {
      // I.4.4 is left out of the total, so the class alone is not enough: the
      // row must already sit on energy industries. A mistagged consumption row
      // (e.g. "Electricity" on I.1.2) keeps the model's reference.
      const { subsectorSlug } = normalizeSectorAndSubsector(
        row.sector ?? "",
        row.subsector ?? "",
      );
      if (
        subsectorSlug === "energy-industries" ||
        row.gpcRefNo?.startsWith("I.4.")
      ) {
        set({ gpcRefNo: "I.4.4" });
      }
      break;
    }
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
