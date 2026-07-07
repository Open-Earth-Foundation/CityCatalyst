import createHttpError from "http-errors";
import { Op } from "sequelize";

import InventoryProgressService from "@/backend/InventoryProgressService";
import { getEmissionResults } from "@/backend/ResultsService";
import { db } from "@/models";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { User } from "@/models/User";
import { Roles } from "@/util/types";

type InventoryMetadata = {
  city: string;
  inventory: {
    year: number | null;
    type: string | null;
    gwp: string | null;
  };
};

type AccessibleInventory = {
  inventory_id: string;
  inventory_name: string | null;
  year: number | null;
  type: string | null;
  gwp: string | null;
};

type AccessibleInventoryCity = {
  city_id: string;
  name: string | null;
  country: string | null;
  region: string | null;
  locode: string | null;
  inventories: AccessibleInventory[];
};

type AccessibleInventoryList = {
  cities: AccessibleInventoryCity[];
  total_cities: number;
  total_inventories: number;
  filters: {
    city_query: string | null;
    year: number | null;
    include_all_city_years: boolean;
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

export async function buildAccessibleInventoryList({
  userId,
  cityQuery,
  year,
  includeAllCityYears = false,
}: {
  userId: string;
  cityQuery?: string;
  year?: number;
  includeAllCityYears?: boolean;
}): Promise<AccessibleInventoryList> {
  const user = await db.models.User.findOne({
    attributes: ["userId", "role"],
    where: { userId },
    include: [
      {
        model: db.models.City,
        as: "cities",
        include: [{ model: db.models.Inventory, as: "inventories" }],
      },
    ],
  });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  const normalizedQuery = normalizeSearch(cityQuery);
  const cities = (await candidateCitiesForUser(user))
    .filter((city: City) => cityMatchesQuery(city, normalizedQuery))
    .map((city: City) => accessibleCity(city, year, includeAllCityYears))
    .filter((city) => city.inventories.length > 0)
    .sort((a, b) => citySortLabel(a).localeCompare(citySortLabel(b)));

  return {
    cities,
    total_cities: cities.length,
    total_inventories: cities.reduce(
      (sum, city) => sum + city.inventories.length,
      0,
    ),
    filters: {
      city_query: cityQuery?.trim() || null,
      year: year ?? null,
      include_all_city_years: includeAllCityYears,
    },
  };
}

/** Return city candidates broad enough to match PermissionService inventory checks. */
async function candidateCitiesForUser(user: User): Promise<City[]> {
  const directCities = user.cities ?? [];
  if (user.role === Roles.Admin) {
    return dedupeCities([...directCities, ...(await citiesWithInventories())]);
  }

  const accessScopes = await elevatedAccessScopes(user.userId);
  if (
    accessScopes.organizationIds.length === 0 &&
    accessScopes.projectIds.length === 0
  ) {
    return dedupeCities(directCities);
  }

  return dedupeCities([
    ...directCities,
    ...(await citiesWithInventories(accessScopes)),
  ]);
}

/** Return project and organization scopes that match the CC project drawer. */
async function elevatedAccessScopes(userId: string): Promise<{
  organizationIds: string[];
  projectIds: string[];
}> {
  const [organizationAdmins, projectAdmins] = await Promise.all([
    db.models.OrganizationAdmin.findAll({
      attributes: ["organizationId"],
      where: { userId },
    }),
    db.models.ProjectAdmin.findAll({
      attributes: ["projectId"],
      where: { userId },
    }),
  ]);

  return {
    organizationIds: Array.from(
      new Set(organizationAdmins.map((admin) => admin.organizationId)),
    ),
    projectIds: Array.from(
      new Set(projectAdmins.map((admin) => admin.projectId)),
    ),
  };
}

/** Load city candidates with their inventories, optionally scoped to projects/orgs. */
async function citiesWithInventories(accessScopes?: {
  organizationIds?: string[];
  projectIds?: string[];
}): Promise<City[]> {
  const organizationIds = accessScopes?.organizationIds ?? [];
  const projectIds = accessScopes?.projectIds ?? [];
  const projectWhere = [
    organizationIds.length
      ? { organizationId: { [Op.in]: organizationIds } }
      : null,
    projectIds.length ? { projectId: { [Op.in]: projectIds } } : null,
  ].filter(Boolean);

  const projectInclude = {
    model: db.models.Project,
    as: "project",
    attributes: ["projectId", "organizationId"],
    required: projectWhere.length > 0,
    ...(projectWhere.length > 0 ? { where: { [Op.or]: projectWhere } } : {}),
  };

  return (await db.models.City.findAll({
    include: [
      { model: db.models.Inventory, as: "inventories" },
      projectInclude,
    ],
  })) as City[];
}

/** Keep the first candidate when access paths overlap. */
function dedupeCities(cities: City[]): City[] {
  const seen = new Set<string>();
  return cities.filter((city) => {
    if (seen.has(city.cityId)) {
      return false;
    }
    seen.add(city.cityId);
    return true;
  });
}

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

function accessibleCity(
  city: City,
  year: number | undefined,
  includeAllCityYears: boolean,
): AccessibleInventoryCity {
  const inventories = (city.inventories ?? [])
    .filter((inventory: Inventory) => {
      return includeAllCityYears || year == null || inventory.year === year;
    })
    .sort(
      (a: Inventory, b: Inventory) => Number(b.year ?? 0) - Number(a.year ?? 0),
    )
    .map((inventory: Inventory) => ({
      inventory_id: inventory.inventoryId,
      inventory_name: inventory.inventoryName ?? null,
      year: inventory.year ?? null,
      type: inventory.inventoryType ?? null,
      gwp: inventory.globalWarmingPotentialType ?? null,
    }));

  return {
    city_id: city.cityId,
    name: city.name ?? null,
    country: city.country ?? null,
    region: city.region ?? null,
    locode: city.locode ?? null,
    inventories,
  };
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

function normalizeSearch(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function cityMatchesQuery(city: City, normalizedQuery: string | null): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return [city.name, city.country, city.region, city.locode]
    .filter(isPresentString)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function citySortLabel(city: AccessibleInventoryCity): string {
  return [city.name, city.country, city.region, city.locode]
    .filter(isPresentString)
    .join(" ");
}

function isPresentString(value: string | null | undefined): value is string {
  return Boolean(value);
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
