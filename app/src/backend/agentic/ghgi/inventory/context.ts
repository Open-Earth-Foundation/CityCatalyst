import createHttpError from "http-errors";
import Decimal from "decimal.js";

import InventoryProgressService from "@/backend/InventoryProgressService";
import { ProjectService } from "@/backend/ProjectsService";
import { getEmissionResults } from "@/backend/ResultsService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
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
  updated_at: string | null;
};

type AccessibleInventoryCity = {
  city_id: string;
  name: string | null;
  country: string | null;
  region: string | null;
  locode: string | null;
  project_id: string | null;
  project_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  inventories: AccessibleInventory[];
};

type AccessibleInventoryProjectBreakdown = {
  organization_id: string | null;
  organization_name: string | null;
  project_id: string | null;
  project_name: string | null;
  total_cities: number;
  total_inventories: number;
};

type AccessibleInventoryList = {
  cities: AccessibleInventoryCity[];
  total_cities: number;
  total_inventories: number;
  /** Aggregated city/inventory counts grouped by organization + project. */
  by_project: AccessibleInventoryProjectBreakdown[];
  /**
   * `platform` = system/super admin (all cities); `projects` = scoped via
   * project/org admin or city membership.
   */
  access_scope: "platform" | "projects";
  filters: {
    city_id: string | null;
    city_query: string | null;
    year: number | null;
    include_all_city_years: boolean;
  };
};

type InventoryListInventory = {
  inventoryId: string;
  inventoryName?: string | null;
  year?: number | null;
  inventoryType?: string | null;
  globalWarmingPotentialType?: string | null;
  lastUpdated?: Date | string | null;
};

type InventoryListCity = {
  cityId: string;
  name?: string | null;
  country?: string | null;
  region?: string | null;
  locode?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  inventories?: InventoryListInventory[];
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

/**
 * List inventories the user can access, with org/project metadata for Clima
 * breakdown answers ("you have access to …").
 *
 * System admins (`Roles.Admin`) get platform-wide cities (`access_scope:
 * "platform"`). Everyone else uses `ProjectService.fetchUserProjects`
 * (`access_scope: "projects"`).
 */
export async function buildAccessibleInventoryList({
  userId,
  cityId,
  cityQuery,
  year,
  includeAllCityYears = false,
}: {
  userId: string;
  cityId?: string;
  cityQuery?: string;
  year?: number;
  includeAllCityYears?: boolean;
}): Promise<AccessibleInventoryList> {
  const user = await db.models.User.findOne({
    attributes: ["userId", "role"],
    where: { userId },
  });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  const accessScope: AccessibleInventoryList["access_scope"] =
    user.role === Roles.Admin ? "platform" : "projects";
  const normalizedQuery = normalizeSearch(cityQuery);
  const cities = (await candidateCitiesForUser(user.userId, user.role))
    .filter((city) => cityId == null || city.cityId === cityId)
    .filter((city) => cityMatchesQuery(city, normalizedQuery))
    .map((city) => accessibleCity(city, year, includeAllCityYears))
    .filter((city) => city.inventories.length > 0)
    .sort((a, b) => citySortLabel(a).localeCompare(citySortLabel(b)));

  return summarizeAccessibleInventoryList(cities, accessScope, {
    city_id: cityId ?? null,
    city_query: cityQuery?.trim() || null,
    year: year ?? null,
    include_all_city_years: includeAllCityYears,
  });
}

/**
 * Recompute totals and `by_project` after permission filtering so the route
 * and builder share one summary shape.
 */
export function summarizeAccessibleInventoryList(
  cities: AccessibleInventoryCity[],
  accessScope: AccessibleInventoryList["access_scope"],
  filters: AccessibleInventoryList["filters"],
): AccessibleInventoryList {
  return {
    cities,
    total_cities: cities.length,
    total_inventories: cities.reduce(
      (sum, city) => sum + city.inventories.length,
      0,
    ),
    by_project: buildProjectBreakdown(cities),
    access_scope: accessScope,
    filters,
  };
}

/** Return city candidates using the same maintained project/city discovery as the CC drawer. */
async function candidateCitiesForUser(
  userId: string,
  role?: string | null,
): Promise<InventoryListCity[]> {
  if (role === Roles.Admin) {
    return citiesWithInventories();
  }

  const projects = await ProjectService.fetchUserProjects(userId);
  const organizationNames = await organizationNameById(
    projects.map((project) => project.organizationId),
  );

  return dedupeCities(
    projects.flatMap((project) =>
      (project.cities as InventoryListCity[]).map((city) => ({
        ...city,
        projectId: project.projectId,
        projectName: project.name,
        organizationId: project.organizationId,
        organizationName: organizationNames.get(project.organizationId) ?? null,
      })),
    ),
  );
}

/** Load all city candidates for system admins, including org/project labels. */
async function citiesWithInventories(): Promise<InventoryListCity[]> {
  const cities = await db.models.City.findAll({
    include: [
      { model: db.models.Inventory, as: "inventories" },
      {
        model: db.models.Project,
        as: "project",
        include: [
          {
            model: db.models.Organization,
            as: "organization",
            attributes: ["organizationId", "name"],
          },
        ],
      },
    ],
  });

  return cities.map((city) => {
    const project = city.project;
    const organization = project?.organization;
    return {
      cityId: city.cityId,
      name: city.name,
      country: city.country,
      region: city.region,
      locode: city.locode,
      projectId: project?.projectId ?? null,
      projectName: project?.name ?? null,
      organizationId:
        organization?.organizationId ?? project?.organizationId ?? null,
      organizationName: organization?.name ?? null,
      inventories: city.inventories as InventoryListInventory[],
    };
  });
}

/** Resolve organization display names for the given IDs. */
async function organizationNameById(
  organizationIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(organizationIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const organizations = await db.models.Organization.findAll({
    attributes: ["organizationId", "name"],
    where: { organizationId: uniqueIds },
  });

  return new Map(
    organizations.map((organization) => [
      organization.organizationId,
      organization.name ?? null,
    ]),
  );
}

/** Keep the first candidate when access paths overlap. */
function dedupeCities(cities: InventoryListCity[]): InventoryListCity[] {
  const seen = new Set<string>();
  return cities.filter((city) => {
    if (seen.has(city.cityId)) {
      return false;
    }
    seen.add(city.cityId);
    return true;
  });
}

/** Aggregate accessible cities into org/project totals for Clima summaries. */
function buildProjectBreakdown(
  cities: AccessibleInventoryCity[],
): AccessibleInventoryProjectBreakdown[] {
  const byProject = new Map<string, AccessibleInventoryProjectBreakdown>();

  for (const city of cities) {
    const key = city.project_id ?? `unassigned:${city.city_id}`;
    const existing = byProject.get(key);
    if (!existing) {
      byProject.set(key, {
        organization_id: city.organization_id,
        organization_name: city.organization_name,
        project_id: city.project_id,
        project_name: city.project_name,
        total_cities: 1,
        total_inventories: city.inventories.length,
      });
      continue;
    }

    existing.total_cities += 1;
    existing.total_inventories += city.inventories.length;
  }

  return [...byProject.values()].sort((a, b) => {
    const orgCompare = (a.organization_name ?? "").localeCompare(
      b.organization_name ?? "",
    );
    if (orgCompare !== 0) {
      return orgCompare;
    }
    return (a.project_name ?? "").localeCompare(b.project_name ?? "");
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
    total_emissions_tco2e:
      kilogramsToTonnesString(results.totalEmissions) ?? "0",
    by_sector: emissionSectors(
      results.totalEmissionsBySector ?? [],
      results.totalEmissions,
    ),
    top_emitters: topEmitters(
      results.topEmissionsBySubSector ?? [],
      results.totalEmissions,
    ),
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
  city: InventoryListCity,
  year: number | undefined,
  includeAllCityYears: boolean,
): AccessibleInventoryCity {
  const inventories = (city.inventories ?? [])
    .filter((inventory: InventoryListInventory) => {
      return includeAllCityYears || year == null || inventory.year === year;
    })
    .sort(compareInventoriesNewestFirst)
    .map((inventory: InventoryListInventory) => ({
      inventory_id: inventory.inventoryId,
      inventory_name: inventory.inventoryName ?? null,
      year: inventory.year ?? null,
      type: inventory.inventoryType ?? null,
      gwp: inventory.globalWarmingPotentialType ?? null,
      updated_at: inventoryTimestamp(inventory.lastUpdated),
    }));

  return {
    city_id: city.cityId,
    name: city.name ?? null,
    country: city.country ?? null,
    region: city.region ?? null,
    locode: city.locode ?? null,
    project_id: city.projectId ?? null,
    project_name: city.projectName ?? null,
    organization_id: city.organizationId ?? null,
    organization_name: city.organizationName ?? null,
    inventories,
  };
}

function compareInventoriesNewestFirst(
  a: InventoryListInventory,
  b: InventoryListInventory,
): number {
  const yearDifference = Number(b.year ?? 0) - Number(a.year ?? 0);
  if (yearDifference !== 0) {
    return yearDifference;
  }

  const updatedDifference =
    timestampValue(b.lastUpdated) - timestampValue(a.lastUpdated);
  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return a.inventoryId.localeCompare(b.inventoryId);
}

function timestampValue(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function inventoryTimestamp(
  value: Date | string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
  totalEmissions: unknown,
): InventoryEmissionsContext["by_sector"] {
  return sectors.map((sector) => {
    const reference = sectorReferenceForName(sector.sectorName);
    return {
      sector: sectorLabel({
        referenceNumber: reference,
        sectorName: sector.sectorName,
      }),
      reference,
      emissions_tco2e: kilogramsToTonnesString(sector.co2eq) ?? "0",
      share_percent: sharePercent(sector.co2eq, totalEmissions),
    };
  });
}

function topEmitters(
  emitters: TopEmitter[],
  totalEmissions: unknown,
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
      emissions_tco2e: kilogramsToTonnesString(emitter.co2eq) ?? "0",
      share_percent: sharePercent(emitter.co2eq, totalEmissions),
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

function kilogramsToTonnesString(value: unknown): string | null {
  const kilograms = valueToString(value);
  return kilograms == null
    ? null
    : new Decimal(kilograms).dividedBy(1000).toString();
}

function sharePercent(value: unknown, total: unknown): number {
  const denominator = new Decimal(valueToString(total) ?? 0);
  if (denominator.lessThanOrEqualTo(0)) {
    return 0;
  }
  return new Decimal(valueToString(value) ?? 0)
    .times(100)
    .dividedBy(denominator)
    .toDecimalPlaces(2)
    .toNumber();
}

function normalizeSearch(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function cityMatchesQuery(
  city: InventoryListCity,
  normalizedQuery: string | null,
): boolean {
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
