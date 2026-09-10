import type { TFunction } from "i18next";
import { ACTION_TYPES, HIAction, MitigationAction, AdaptationAction } from "@/util/types";

/**
 * Quote one CSV cell. Wrapping every non-empty value and doubling embedded
 * quotes is what keeps a cell containing `"` or `,` from splitting the row —
 * callers must never hand-roll `"${value}"` templates of their own.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(opts: {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}): void {
  const { filename, headers, rows } = opts;

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildActionPlanCsv(args: {
  actions: HIAction[];
  t: TFunction;
  type: ACTION_TYPES;
}): { headers: string[]; rows: (string | number)[][] } {
  const { actions, t, type } = args;

  const headers: string[] = [
    t("ranking"),
    t("action-name"),
    t("action-type-label"),
    t("action-description"),
    t("cost"),
    t("timeline-label"),
  ];

  if (type === ACTION_TYPES.Mitigation) {
    headers.push(t("sector-label"), t("ghg-reduction"));
  } else {
    headers.push(t("hazards-covered"), t("adaptation-effectiveness"));
  }

  const rows = actions.map((action) => {
    const baseRow: (string | number)[] = [
      action.rank,
      action.name,
      t(`action-type.${action.type}`),
      action.description || "",
      t(`cost-level.${action.costInvestmentNeeded ?? "unknown"}`),
      t(`timeline.${action.timelineForImplementation ?? "unknown"}`),
    ];

    if (action.type === ACTION_TYPES.Mitigation) {
      const mitigation = action as MitigationAction;
      const sectors = mitigation.sectors.map((s) => t(`sector.${s}`)).join(", ");
      const ghgReduction = Object.entries(mitigation.GHGReductionPotential)
        .filter(([, v]) => v !== null)
        .map(([sector, val]) => `${t(`sector.${sector}`)}: ${val}%`)
        .join("; ");
      baseRow.push(sectors, ghgReduction);
    } else {
      const adaptation = action as AdaptationAction;
      const hazards = adaptation.hazards?.map((h) => t(`hazard.${h}`)).join(", ") || "";
      const effectiveness = adaptation.adaptationEffectiveness
        ? t(`effectiveness-level.${adaptation.adaptationEffectiveness}`)
        : "";
      baseRow.push(hazards, effectiveness);
    }

    return baseRow;
  });

  return { headers, rows };
}

export function downloadActionPlanCsv(args: {
  actions: HIAction[];
  t: TFunction;
  type: ACTION_TYPES;
  cityName?: string;
}): void {
  const { actions, t, type, cityName } = args;

  const { headers, rows } = buildActionPlanCsv({ actions, t, type });
  const typePart = type === ACTION_TYPES.Adaptation ? "Adaptation" : "Mitigation";

  downloadCsv({
    filename: `${(cityName || "actions").replace(/\s+/g, "_")}_${typePart}_actions.csv`,
    headers,
    rows,
  });
}
