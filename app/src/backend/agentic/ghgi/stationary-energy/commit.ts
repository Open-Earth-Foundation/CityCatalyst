import DataSourceService from "@/backend/DataSourceService";
import { stationaryEnergyScopeMatchesTarget } from "@/backend/agentic/ghgi/stationary-energy/scope";
import { Inventory } from "@/models/Inventory";

export type CommitAcceptedRow = {
  proposal_id: string;
  decision_version: number;
  target_ref: Record<string, unknown>;
  selected_source_id: string;
};

export async function commitAcceptedStationaryEnergyRows(params: {
  inventory: Inventory;
  rows: CommitAcceptedRow[];
  userId: string;
}): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = [];
  const seenDatasourceIds = new Set<string>();

  for (const row of params.rows) {
    if (!row.selected_source_id) {
      results.push({
        proposal_id: row.proposal_id,
        decision_version: row.decision_version,
        selected_source_id: row.selected_source_id,
        status: "failed",
        issue: "selected_source_id is required",
      });
      continue;
    }

    if (seenDatasourceIds.has(row.selected_source_id)) {
      results.push({
        proposal_id: row.proposal_id,
        decision_version: row.decision_version,
        selected_source_id: row.selected_source_id,
        status: "skipped_duplicate_source",
      });
      continue;
    }
    seenDatasourceIds.add(row.selected_source_id);

    const source = await DataSourceService.findSource(
      params.inventory.inventoryId,
      row.selected_source_id,
    );
    if (!source) {
      results.push({
        proposal_id: row.proposal_id,
        decision_version: row.decision_version,
        selected_source_id: row.selected_source_id,
        status: "failed",
        issue: "Selected source was not found for the inventory",
      });
      continue;
    }

    const sourceScope = {
      sector_id: source.subSector?.sectorId ?? source.subCategory?.subsector?.sectorId,
      subsector_id:
        source.subSector?.subsectorId ?? source.subCategory?.subsector?.subsectorId,
      subsector_reference_number:
        source.subSector?.referenceNumber ??
        source.subCategory?.subsector?.referenceNumber,
      subcategory_id: source.subCategory?.subcategoryId ?? null,
      subcategory_reference_number: source.subCategory?.referenceNumber ?? null,
      scope_id: source.subCategory?.scopeId ?? source.subCategory?.scope?.scopeId ?? null,
    };

    if (!stationaryEnergyScopeMatchesTarget(row.target_ref, sourceScope)) {
      results.push({
        proposal_id: row.proposal_id,
        decision_version: row.decision_version,
        selected_source_id: row.selected_source_id,
        status: "failed",
        issue: "Selected source does not match the reviewed Stationary Energy target",
      });
      continue;
    }

    const populationScaleFactors =
      await DataSourceService.findPopulationScaleFactors(params.inventory, [source]);
    const applyResult = await DataSourceService.applySource(
      source,
      params.inventory,
      populationScaleFactors,
      params.userId,
      true,
    );

    if (applyResult.success) {
      results.push({
        proposal_id: row.proposal_id,
        decision_version: row.decision_version,
        selected_source_id: row.selected_source_id,
        status: "committed",
      });
      continue;
    }

    results.push({
      proposal_id: row.proposal_id,
      decision_version: row.decision_version,
      selected_source_id: row.selected_source_id,
      status: "failed",
      issue: applyResult.issue ?? "Source application failed",
    });
  }

  return results;
}
