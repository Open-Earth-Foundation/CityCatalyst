import createHttpError from "http-errors";

import InventoryProgressService from "@/backend/InventoryProgressService";
import { getEmissionResults } from "@/backend/ResultsService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";

type InventoryMetadata = {
  city: string;
  inventory: {
    year: number | null;
    type: string | null;
    gwp: string | null;
  };
};

type DataState = {
  third_party: number;
  manual_or_uploaded: number;
  not_estimated: number;
  not_occurring: number;
};

type SectorStatus = {
  sector: string;
  reference: string | null;
  required: number;
  filled: number;
  missing: number;
  completion_percent: number;
  data_state: DataState;
};

type InventoryStatusOverview = InventoryMetadata & {
  completion: {
    required: number;
    filled: number;
    missing: number;
    completion_percent: number;
  };
  by_sector: SectorStatus[];
};

type InventoryEmissionsContext = InventoryMetadata & {
  total_emissions_tco2e: string;
  by_sector: Array<{
    sector: string;
    reference: string | null;
    emissions_tco2e: string;
    share_percent: number;
  }>;
  top_emitters: Array<{
    sector: string;
    subsector: string;
    scope: string | null;
    emissions_tco2e: string;
    share_percent: number;
  }>;
  source_summary: {
    third_party_values: number;
    manual_or_uploaded_values: number;
    not_estimated_values: number;
    not_occurring_values: number;
    sectors_with_third_party_data: string[];
    sectors_without_filled_data: string[];
  };
};

type ProgressSector = {
  sector: {
    sectorName?: string | null;
    referenceNumber?: string | null;
  };
  total?: number | null;
  thirdParty?: number | null;
  uploaded?: number | null;
  reasonNE?: number | null;
  reasonNO?: number | null;
};

type EmissionSector = {
  sectorName?: string | null;
  co2eq?: unknown;
  percentage?: number | null;
};

type TopEmitter = {
  sectorName?: string | null;
  subsectorName?: string | null;
  scopeName?: string | null;
  co2eq?: unknown;
  percentage?: number | null;
};

const SECTOR_METADATA_BY_REFERENCE: Record<
  string,
  { label: string; slug: string }
> = {
  I: { label: "Stationary Energy", slug: "stationary-energy" },
  II: { label: "Transportation", slug: "transportation" },
  III: { label: "Waste", slug: "waste" },
  IV: { label: "IPPU", slug: "ippu" },
  V: { label: "AFOLU", slug: "afolu" },
};

const SECTOR_REFERENCE_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SECTOR_METADATA_BY_REFERENCE).map(([reference, metadata]) => [
    metadata.slug,
    reference,
  ]),
);

const SECTOR_REFERENCE_BY_DB_NAME: Record<string, string> = {
  "Stationary Energy": "I",
  Transportation: "II",
  Waste: "III",
  "Industrial Processes and Product Uses (IPPU)": "IV",
  "Agriculture, Forestry, and Other Land Use (AFOLU)": "V",
};

export async function buildInventoryStatusOverview(
  inventory: Inventory,
): Promise<InventoryStatusOverview> {
  const inventoryWithValues = await loadInventoryForProgress(inventory);
  const progress =
    await InventoryProgressService.getInventoryProgress(inventoryWithValues);
  const bySector = sectorStatusesFromProgress(progress.sectorProgress ?? []);
  const required = bySector.reduce((sum, sector) => sum + sector.required, 0);
  const filled = bySector.reduce((sum, sector) => sum + sector.filled, 0);

  return {
    ...metadataForInventory(inventoryWithValues),
    completion: {
      required,
      filled,
      missing: Math.max(required - filled, 0),
      completion_percent: completionPercent(filled, required),
    },
    by_sector: bySector,
  };
}

export async function buildInventoryEmissionsContext(
  inventory: Inventory,
): Promise<InventoryEmissionsContext> {
  const [overview, results] = await Promise.all([
    buildInventoryStatusOverview(inventory),
    getEmissionResults(inventory.inventoryId),
  ]);

  return {
    city: overview.city,
    inventory: overview.inventory,
    total_emissions_tco2e: valueToString(results.totalEmissions) ?? "0",
    by_sector: emissionSectors(results.totalEmissionsBySector ?? []),
    top_emitters: topEmitters(results.topEmissionsBySubSector ?? []),
    source_summary: sourceSummaryFromSectors(overview.by_sector),
  };
}

async function loadInventoryForProgress(
  inventory: Inventory,
): Promise<Inventory> {
  const inventoryWithValues = (await db.models.Inventory.findByPk(
    inventory.inventoryId,
    {
      include: [
        { model: db.models.City, as: "city" },
        {
          model: db.models.InventoryValue,
          as: "inventoryValues",
          include: [
            {
              model: db.models.DataSource,
              as: "dataSource",
            },
          ],
        },
      ],
    },
  )) as Inventory | null;

  if (!inventoryWithValues) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  return inventoryWithValues;
}

function metadataForInventory(inventory: Inventory): InventoryMetadata {
  return {
    city: cityLabel(inventory),
    inventory: {
      year: inventory.year ?? null,
      type: inventory.inventoryType ?? null,
      gwp: inventory.globalWarmingPotentialType ?? null,
    },
  };
}

function sectorStatusesFromProgress(
  sectorProgress: ProgressSector[],
): SectorStatus[] {
  return sectorProgress.map((progress) => {
    const required = Number(progress.total ?? 0);
    const dataState = dataStateFromProgress(progress);
    const filled = Object.values(dataState).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      sector: sectorLabel(progress.sector),
      reference: progress.sector.referenceNumber ?? null,
      required,
      filled,
      missing: Math.max(required - filled, 0),
      completion_percent: completionPercent(filled, required),
      data_state: dataState,
    };
  });
}

function dataStateFromProgress(progress: ProgressSector): DataState {
  return {
    third_party: Number(progress.thirdParty ?? 0),
    manual_or_uploaded: Number(progress.uploaded ?? 0),
    not_estimated: Number(progress.reasonNE ?? 0),
    not_occurring: Number(progress.reasonNO ?? 0),
  };
}

function emissionSectors(
  sectors: EmissionSector[],
): InventoryEmissionsContext["by_sector"] {
  return sectors.map((sector) => {
    const reference = sectorReferenceForName(sector.sectorName);
    return {
      sector: sectorLabel({
        referenceNumber: reference,
        sectorName: sector.sectorName,
      }),
      reference,
      emissions_tco2e: valueToString(sector.co2eq) ?? "0",
      share_percent: Number(sector.percentage ?? 0),
    };
  });
}

function topEmitters(
  emitters: TopEmitter[],
): InventoryEmissionsContext["top_emitters"] {
  return emitters.slice(0, 10).map((emitter) => {
    const reference = sectorReferenceForName(emitter.sectorName);
    return {
      sector: sectorLabel({
        referenceNumber: reference,
        sectorName: emitter.sectorName,
      }),
      subsector: emitter.subsectorName ?? "Unknown subsector",
      scope: scopeLabel(emitter.scopeName),
      emissions_tco2e: valueToString(emitter.co2eq) ?? "0",
      share_percent: Number(emitter.percentage ?? 0),
    };
  });
}

function sourceSummaryFromSectors(
  sectors: SectorStatus[],
): InventoryEmissionsContext["source_summary"] {
  return {
    third_party_values: sectors.reduce(
      (sum, sector) => sum + sector.data_state.third_party,
      0,
    ),
    manual_or_uploaded_values: sectors.reduce(
      (sum, sector) => sum + sector.data_state.manual_or_uploaded,
      0,
    ),
    not_estimated_values: sectors.reduce(
      (sum, sector) => sum + sector.data_state.not_estimated,
      0,
    ),
    not_occurring_values: sectors.reduce(
      (sum, sector) => sum + sector.data_state.not_occurring,
      0,
    ),
    sectors_with_third_party_data: sectors
      .filter((sector) => sector.data_state.third_party > 0)
      .map((sector) => sector.sector),
    sectors_without_filled_data: sectors
      .filter((sector) => sector.filled === 0)
      .map((sector) => sector.sector),
  };
}

function cityLabel(inventory: Inventory): string {
  const city = inventory.city;
  const parts = [city?.name, city?.country].filter(Boolean);
  return parts.join(", ") || "Unknown city";
}

function sectorLabel(sector: {
  sectorName?: string | null;
  referenceNumber?: string | null;
}): string {
  const reference = sector.referenceNumber ?? undefined;
  if (reference && SECTOR_METADATA_BY_REFERENCE[reference]) {
    return SECTOR_METADATA_BY_REFERENCE[reference].label;
  }
  const referenceFromName = sectorReferenceForName(sector.sectorName);
  if (referenceFromName && SECTOR_METADATA_BY_REFERENCE[referenceFromName]) {
    return SECTOR_METADATA_BY_REFERENCE[referenceFromName].label;
  }
  return friendlyLabel(sector.sectorName);
}

function sectorReferenceForName(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  if (SECTOR_REFERENCE_BY_SLUG[value]) {
    return SECTOR_REFERENCE_BY_SLUG[value];
  }
  if (SECTOR_REFERENCE_BY_DB_NAME[value]) {
    return SECTOR_REFERENCE_BY_DB_NAME[value];
  }
  return null;
}

function scopeLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.toLowerCase().startsWith("scope ") ? value : `Scope ${value}`;
}

function completionPercent(filled: number, required: number): number {
  if (required <= 0) {
    return 0;
  }
  return Math.round((filled / required) * 100);
}

function valueToString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return String(value);
}

function friendlyLabel(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) {
    return "Unknown sector";
  }
  return text
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
