import ActivityService from "@/backend/ActivityService";
import DataSourceService from "@/backend/DataSourceService";
import { stationaryEnergyScopeMatchesTarget } from "@/backend/agentic/ghgi/stationary-energy/scope";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import {
  MANUAL_INPUT_HIERARCHY,
  type DirectMeasure,
  type ExtraField,
} from "@/util/form-schema";

type CommitAcceptedBaseRow = {
  proposal_id: string;
  decision_version: number;
  target_ref: Record<string, unknown>;
};

export type CommitAcceptedSelectedSourceRow = CommitAcceptedBaseRow & {
  row_type: "selected_source";
  selected_source_id: string;
};

export type CommitAcceptedManualOverrideRow = CommitAcceptedBaseRow & {
  row_type: "manual_override";
  manual_value: number;
  manual_unit: string;
  note?: string;
};

export type CommitAcceptedRow =
  | CommitAcceptedSelectedSourceRow
  | CommitAcceptedManualOverrideRow;

type ManualEmissionsUnit = "units-kilograms" | "units-tonnes";

const MANUAL_OVERRIDE_DATA_SOURCE = "Stationary Energy manual override";

export async function commitAcceptedStationaryEnergyRows(params: {
  inventory: Inventory;
  rows: CommitAcceptedRow[];
  userId: string;
}): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = [];
  const seenDatasourceIds = new Set<string>();

  for (const row of params.rows) {
    if (row.row_type === "manual_override") {
      results.push(await commitManualOverrideRow({ ...params, row }));
      continue;
    }

    results.push(
      await commitSelectedSourceRow({
        ...params,
        row,
        seenDatasourceIds,
      }),
    );
  }

  return results;
}

async function commitSelectedSourceRow(params: {
  inventory: Inventory;
  row: CommitAcceptedSelectedSourceRow;
  seenDatasourceIds: Set<string>;
  userId: string;
}): Promise<Record<string, unknown>> {
  const { inventory, row, seenDatasourceIds, userId } = params;

  if (!row.selected_source_id) {
    return {
      proposal_id: row.proposal_id,
      decision_version: row.decision_version,
      selected_source_id: row.selected_source_id,
      status: "failed",
      issue: "selected_source_id is required",
    };
  }

  if (seenDatasourceIds.has(row.selected_source_id)) {
    return {
      proposal_id: row.proposal_id,
      decision_version: row.decision_version,
      selected_source_id: row.selected_source_id,
      status: "skipped_duplicate_source",
    };
  }
  seenDatasourceIds.add(row.selected_source_id);

  const source = await DataSourceService.findSource(
    inventory.inventoryId,
    row.selected_source_id,
  );
  if (!source) {
    return {
      proposal_id: row.proposal_id,
      decision_version: row.decision_version,
      selected_source_id: row.selected_source_id,
      status: "failed",
      issue: "Selected source was not found for the inventory",
    };
  }

  const sourceScope = {
    sector_id:
      source.subSector?.sectorId ?? source.subCategory?.subsector?.sectorId,
    subsector_id:
      source.subSector?.subsectorId ??
      source.subCategory?.subsector?.subsectorId,
    subsector_reference_number:
      source.subSector?.referenceNumber ??
      source.subCategory?.subsector?.referenceNumber,
    subcategory_id: source.subCategory?.subcategoryId ?? null,
    subcategory_reference_number: source.subCategory?.referenceNumber ?? null,
    scope_id:
      source.subCategory?.scopeId ?? source.subCategory?.scope?.scopeId ?? null,
  };

  if (!stationaryEnergyScopeMatchesTarget(row.target_ref, sourceScope)) {
    return {
      proposal_id: row.proposal_id,
      decision_version: row.decision_version,
      selected_source_id: row.selected_source_id,
      status: "failed",
      issue: "source-does-not-match-stationary-energy-target",
    };
  }

  const populationScaleFactors =
    await DataSourceService.findPopulationScaleFactors(inventory, [source]);
  const applyResult = await DataSourceService.applySource(
    source,
    inventory,
    populationScaleFactors,
    userId,
    true,
  );

  if (applyResult.success) {
    return {
      proposal_id: row.proposal_id,
      decision_version: row.decision_version,
      selected_source_id: row.selected_source_id,
      status: "committed",
    };
  }

  return {
    proposal_id: row.proposal_id,
    decision_version: row.decision_version,
    selected_source_id: row.selected_source_id,
    status: "failed",
    issue: applyResult.issue ?? "Source application failed",
  };
}

async function commitManualOverrideRow(params: {
  inventory: Inventory;
  row: CommitAcceptedManualOverrideRow;
  userId: string;
}): Promise<Record<string, unknown>> {
  const { inventory, row, userId } = params;

  const referenceNumber = targetReferenceNumber(row.target_ref);
  if (!referenceNumber) {
    return manualFailureResult(
      row,
      "Manual override target is missing a GPC reference number.",
    );
  }

  const directMeasure = MANUAL_INPUT_HIERARCHY[referenceNumber]?.directMeasure;
  if (!directMeasure) {
    return manualFailureResult(
      row,
      `No direct-measure methodology is available for ${referenceNumber}.`,
    );
  }

  if (!Number.isFinite(row.manual_value) || row.manual_value <= 0) {
    return manualFailureResult(
      row,
      "manual_value must be a positive number for manual overrides.",
    );
  }

  const normalizedEmissions = normalizeManualEmissions(
    row.manual_value,
    row.manual_unit,
  );
  if (!normalizedEmissions) {
    return manualFailureResult(
      row,
      `Unsupported manual_unit '${row.manual_unit}' for manual overrides.`,
    );
  }

  const activityData = buildManualActivityData(
    directMeasure,
    normalizedEmissions.value,
    normalizedEmissions.unit,
    row.note,
  );
  if (!activityData) {
    return manualFailureResult(
      row,
      `Direct-measure defaults for ${referenceNumber} are incomplete.`,
    );
  }

  try {
    const existingInventoryValue = await db.models.InventoryValue.findOne({
      where: {
        inventoryId: inventory.inventoryId,
        gpcReferenceNumber: referenceNumber,
      },
    });
    if (existingInventoryValue) {
      await existingInventoryValue.destroy();
    }

    await ActivityService.createActivity(
      {
        activityData,
        metadata: {},
      },
      inventory.inventoryId,
      undefined,
      {
        gpcReferenceNumber: referenceNumber,
        inputMethodology: "direct-measure",
      },
      [{ gas: "CO2" }],
      userId,
    );
  } catch (error) {
    return manualFailureResult(
      row,
      error instanceof Error ? error.message : "Manual override failed",
    );
  }

  return {
    proposal_id: row.proposal_id,
    decision_version: row.decision_version,
    manual_value: row.manual_value,
    manual_unit: row.manual_unit,
    status: "committed",
  };
}

function targetReferenceNumber(
  targetRef: Record<string, unknown>,
): string | null {
  const subcategoryReference = asString(
    targetRef["subcategory_reference_number"],
  );
  if (subcategoryReference) {
    return subcategoryReference;
  }
  return asString(targetRef["subsector_reference_number"]);
}

function buildManualActivityData(
  directMeasure: DirectMeasure,
  manualValue: number,
  manualUnit: ManualEmissionsUnit,
  note?: string,
): Record<string, unknown> | null {
  const activityData: Record<string, unknown> = {
    co2_amount: manualValue,
    co2_unit: manualUnit,
  };

  for (const field of directMeasure["extra-fields"] ?? []) {
    const value = defaultExtraFieldValue(field, note);
    if (value === undefined) {
      return null;
    }
    activityData[field.id] = value;
  }

  return activityData;
}

function defaultExtraFieldValue(
  field: ExtraField,
  note?: string,
): string | string[] | undefined {
  if (field.type === "text") {
    const trimmedNote = note?.trim();
    return trimmedNote || MANUAL_OVERRIDE_DATA_SOURCE;
  }

  if (!Array.isArray(field.options) || field.options.length === 0) {
    return undefined;
  }

  const option =
    field.exclusive ??
    (typeof field.options[0] === "string" ? field.options[0] : undefined);
  if (!option) {
    return undefined;
  }

  return field.multiselect ? [option] : option;
}

function normalizeManualEmissions(
  manualValue: number,
  manualUnit: string,
): { value: number; unit: ManualEmissionsUnit } | null {
  const normalizedUnit = manualUnit.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tonnesMapping: Record<string, number> = {
    t: 1,
    tonnes: 1,
    tonne: 1,
    tons: 1,
    ton: 1,
    unitstonnes: 1,
    tco2e: 1,
    tco2eq: 1,
    tco2: 1,
    kt: 1_000,
    ktco2e: 1_000,
    ktco2eq: 1_000,
    mt: 1_000_000,
    mtco2e: 1_000_000,
    mtco2eq: 1_000_000,
  };
  if (normalizedUnit in tonnesMapping) {
    return {
      value: manualValue * tonnesMapping[normalizedUnit],
      unit: "units-tonnes",
    };
  }

  const kilogramUnits = new Set([
    "kg",
    "kgs",
    "kilogram",
    "kilograms",
    "unitskilograms",
    "kgco2e",
    "kgco2eq",
    "kgco2",
  ]);
  if (kilogramUnits.has(normalizedUnit)) {
    return {
      value: manualValue,
      unit: "units-kilograms",
    };
  }

  return null;
}

function manualFailureResult(
  row: CommitAcceptedManualOverrideRow,
  issue: string,
): Record<string, unknown> {
  return {
    proposal_id: row.proposal_id,
    decision_version: row.decision_version,
    manual_value: row.manual_value,
    manual_unit: row.manual_unit,
    status: "failed",
    issue,
  };
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
