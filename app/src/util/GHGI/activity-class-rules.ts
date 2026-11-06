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
