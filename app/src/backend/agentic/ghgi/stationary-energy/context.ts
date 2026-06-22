import DataSourceService, {
  type RemovedSourceResult,
} from "@/backend/DataSourceService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import inventoryStructure from "@/data/inventory-structure.json";
import gpcReferenceTable from "@/util/GHGI/data/gpc-reference-table.json";
import {
  findClosestYearToInventory,
  type PopulationEntry,
} from "@/util/helpers";
import { STATIONARY_ENERGY } from "@/util/methodologies/stationary-energy";
import { LANGUAGES } from "@/util/types";

type StationaryEnergyLocale = `${LANGUAGES}`;

type TaxonomyRow = {
  sector_id: string;
  sector_name: string;
  sector_reference_number: string;
  subsector_id: string;
  subsector_name: string;
  subsector_reference_number: string;
  subcategory_id: string;
  subcategory_name: string;
  subcategory_reference_number: string;
  scope_id: string | null;
  scope_name: string | null;
};

type GuidanceContext = {
  sector_overview: {
    sector: string;
    overview: string;
  };
  scope_rules: Array<{
    scope_id: string | null;
    scope_name: string | null;
    rows: number;
    subsectors: string[];
  }>;
  taxonomy_labels: Array<{
    subsector_id: string;
    subsector_name: string;
    subcategory_id: string;
    subcategory_name: string;
    scope_id: string | null;
    scope_name: string | null;
  }>;
  methodology_summaries: Array<Record<string, unknown>>;
  unit_conventions: Array<{
    methodology_id: string;
    parameter: string;
    units: string[];
  }>;
  source_selection_rules: string[];
  known_limits_or_gaps: string[];
};

type ContextPayload = {
  city: Record<string, unknown>;
  inventory: Record<string, unknown>;
  taxonomy: TaxonomyRow[];
  current_values: Array<Record<string, unknown>>;
  source_candidates: Array<Record<string, unknown>>;
  permission_summary: Record<string, unknown>;
  guidance_context: GuidanceContext;
};

type CurrentValueRecord = {
  id: string;
  gpcReferenceNumber?: string | null;
  datasourceId: string | null;
  co2eq: bigint | null;
  unavailableReason?: string | null;
  unavailableExplanation?: string | null;
  subCategoryId: string | null;
  subSectorId: string | null;
  sectorId: string | null;
  dataSource?: { datasourceName?: string | null } | null;
  subCategory?: {
    referenceNumber?: string | null;
    subcategoryName?: string | null;
    scope?: { scopeId?: string | null; scopeName?: string | null } | null;
  } | null;
  subSector?: {
    referenceNumber?: string | null;
    subsectorName?: string | null;
  } | null;
  sector?: {
    referenceNumber?: string | null;
    sectorName?: string | null;
  } | null;
  activityValues?: Array<{
    id: string;
    datasourceId?: string | null;
    activityData?: Record<string, unknown> | null;
    dataSource?: {
      datasourceId?: string | null;
      datasourceName?: string | null;
    } | null;
    gasValues?: Array<{
      id: string;
      gas?: string | null;
      gasAmount?: bigint | null;
    }>;
  }>;
};

const INVENTORY_STRUCTURE = inventoryStructure as Array<Record<string, any>>;
const GPC_REFERENCE_TABLE = gpcReferenceTable as Array<Record<string, any>>;
type CandidateApplicabilityStatus = "applicable" | "removed" | "failed";

export async function buildStationaryEnergyContext(params: {
  inventory: Inventory;
  locale?: string | null;
}): Promise<ContextPayload> {
  const locale = resolveLocale(params.locale);
  const inventory = params.inventory;
  const city = inventory.city;
  const currentValues = await buildCurrentValues(inventory.inventoryId);
  const filledReferenceNumbers =
    filledReferenceNumbersFromCurrentValues(currentValues);
  const taxonomy = filterDraftableTaxonomyRows(
    buildTaxonomy(),
    filledReferenceNumbers,
  );
  const sourceCandidates = await buildSourceCandidates(
    inventory,
    filledReferenceNumbers,
  );
  const guidanceContext = buildGuidanceContext({
    locale,
    taxonomy,
    sourceCandidates,
  });

  return {
    city: {
      city_id: city.cityId,
      name: city.name,
      locode: city.locode,
      country: city.country,
      country_locode: city.locode?.split(" ")[0] ?? null,
      region: city.region,
      region_locode: city.region ?? null,
      area: city.area,
      population: await populationForInventoryYear(city.cityId, inventory.year),
    },
    inventory: {
      inventory_id: inventory.inventoryId,
      year: inventory.year,
      inventory_type: inventory.inventoryType,
      gwp: inventory.globalWarmingPotentialType,
      total_emissions:
        inventory.totalEmissions == null
          ? null
          : String(inventory.totalEmissions),
    },
    taxonomy,
    current_values: currentValues,
    source_candidates: sourceCandidates,
    permission_summary: {
      can_review: true,
      can_commit: true,
      sector_code: "stationary_energy",
    },
    guidance_context: guidanceContext,
  };
}

/**
 * Pick the population record closest to the inventory year and fall back to the latest.
 */
async function populationForInventoryYear(
  cityId: string,
  inventoryYear: number | null | undefined,
): Promise<number | null> {
  const populations = await db.models.Population.findAll({
    where: { cityId },
    order: [["year", "DESC"]],
  });

  const entries: PopulationEntry[] = [];
  for (const row of populations) {
    if (row.population == null || row.year == null) {
      continue;
    }
    entries.push({
      year: row.year,
      population: Number(row.population),
    });
  }

  if (inventoryYear != null) {
    const closest = findClosestYearToInventory(entries, inventoryYear);
    if (closest) {
      return closest.population;
    }
  }

  return entries[0]?.population ?? null;
}

function buildTaxonomy(): TaxonomyRow[] {
  const stationarySector = INVENTORY_STRUCTURE.find(
    (sector) => sector.sectorName === "stationary-energy",
  );
  if (!stationarySector) {
    return [];
  }

  const gpcByReference = new Map(
    GPC_REFERENCE_TABLE.filter((row) => row.sector === "stationary-energy").map(
      (row) => [row.gpcRefNo, row],
    ),
  );

  const rows: TaxonomyRow[] = [];
  for (const subsector of stationarySector.subSectors ?? []) {
    for (const subcategory of subsector.subCategories ?? []) {
      const gpcRow = gpcByReference.get(subcategory.referenceNumber) ?? {};
      rows.push({
        sector_id: stationarySector.sectorId,
        sector_name: "Stationary Energy",
        sector_reference_number: stationarySector.referenceNumber,
        subsector_id: subsector.subsectorId,
        subsector_name: friendlyLabel(
          gpcRow.subsector ??
            subsector.subsectorName ??
            subsector.referenceNumber,
        ),
        subsector_reference_number: subsector.referenceNumber,
        subcategory_id: subcategory.subcategoryId,
        subcategory_name: friendlyLabel(
          gpcRow.subcategoryName ??
            subcategory.subcategoryName ??
            subcategory.referenceNumber,
        ),
        subcategory_reference_number: subcategory.referenceNumber,
        scope_id: subcategory.scopeId ?? subsector.scopeId ?? null,
        scope_name: scopeName(
          subcategory.scope?.scopeName ?? gpcRow.scope ?? null,
        ),
      });
    }
  }

  return rows;
}

export function filterDraftableTaxonomyRows(
  rows: TaxonomyRow[],
  filledReferenceNumbers: Set<string>,
): TaxonomyRow[] {
  if (filledReferenceNumbers.size === 0) {
    return rows;
  }

  return rows.filter((row) => {
    const referenceNumber =
      row.subcategory_reference_number || row.subsector_reference_number;
    return !referenceNumber || !filledReferenceNumbers.has(referenceNumber);
  });
}

async function buildCurrentValues(
  inventoryId: string,
): Promise<Array<Record<string, unknown>>> {
  const stationarySector = INVENTORY_STRUCTURE.find(
    (sector) => sector.sectorName === "stationary-energy",
  );
  if (!stationarySector) {
    return [];
  }

  const values = (await db.models.InventoryValue.findAll({
    where: {
      inventoryId,
      sectorId: stationarySector.sectorId,
    },
    include: [
      { model: db.models.DataSource, as: "dataSource" },
      {
        model: db.models.SubCategory,
        as: "subCategory",
        include: [{ model: db.models.Scope, as: "scope" }],
      },
      { model: db.models.SubSector, as: "subSector" },
      { model: db.models.Sector, as: "sector" },
      {
        model: db.models.ActivityValue,
        as: "activityValues",
        required: false,
        include: [
          { model: db.models.GasValue, as: "gasValues", required: false },
          { model: db.models.DataSource, as: "dataSource", required: false },
        ],
      },
    ],
  })) as CurrentValueRecord[];

  return values.map((value) => {
    const activityValue = value.activityValues?.[0];
    const activityData = (activityValue?.activityData ?? {}) as Record<
      string,
      unknown
    >;
    const activityValueAmount = numericField(
      activityData["activity-value"],
      activityData["activity_total_fuel_consumption"],
      activityData["activity-total-fuel-consumption"],
      activityData["activity-total-energy-consumption"],
    );
    const activityUnit = stringField(
      activityData["activity-unit"],
      activityData["activity_total_fuel_consumption_unit"],
      activityData["activity-total-fuel-consumption-unit"],
      activityData["activity-total-energy-consumption-unit"],
    );
    const gasValues = (activityValue?.gasValues ?? []).map((gasValue) => ({
      gas_value_id: gasValue.id,
      gas: gasValue.gas ?? null,
      gas_amount: bigintToString(gasValue.gasAmount),
    }));
    const primaryGasValue = gasValues[0] ?? null;
    const gpcReferenceNumber =
      value.gpcReferenceNumber ??
      value.subCategory?.referenceNumber ??
      value.subSector?.referenceNumber ??
      null;

    return {
      inventory_value_id: value.id,
      activity_value_id: activityValue?.id ?? null,
      gas_value_id: primaryGasValue?.gas_value_id ?? null,
      gpc_reference_number: gpcReferenceNumber,
      datasource_id: value.datasourceId,
      sector_id:
        value.sector?.referenceNumber ??
        value.sectorId ??
        stationarySector.referenceNumber,
      subsector_id:
        value.subSector?.referenceNumber ?? value.subSectorId ?? null,
      subcategory_id:
        value.subCategory?.referenceNumber ?? value.subCategoryId ?? null,
      scope_id: value.subCategory?.scope?.scopeId ?? null,
      gas: primaryGasValue?.gas ?? null,
      value: activityValueAmount,
      unit: activityUnit ?? "tCO2e",
      emissions_value: bigintToString(value.co2eq),
      emissions_unit: "tCO2e",
      unavailable_reason: value.unavailableReason ?? null,
      unavailable_explanation: value.unavailableExplanation ?? null,
      activity_data: activityData,
      activity_data_source: {
        datasource_id: activityValue?.dataSource?.datasourceId ?? null,
        name: activityValue?.dataSource?.datasourceName ?? null,
      },
      gas_values: gasValues,
      data_source: {
        name: value.dataSource?.datasourceName ?? null,
      },
    };
  });
}

export function filledReferenceNumbersFromCurrentValues(
  currentValues: Array<Record<string, unknown>>,
): Set<string> {
  const filled = new Set<string>();
  for (const currentValue of currentValues) {
    if (!hasCommittedCurrentValue(currentValue)) {
      continue;
    }

    const referenceNumber = stringField(
      currentValue["gpc_reference_number"],
      currentValue["subcategory_id"],
      currentValue["subsector_id"],
    );
    if (referenceNumber) {
      filled.add(referenceNumber);
    }
  }
  return filled;
}

function hasCommittedCurrentValue(value: Record<string, unknown>): boolean {
  if (stringField(value["datasource_id"])) {
    return true;
  }
  if (numericField(value["emissions_value"], value["value"]) != null) {
    return true;
  }

  const unavailableReason = stringField(value["unavailable_reason"]);
  return Boolean(unavailableReason && unavailableReason !== "reason-NE");
}

async function buildSourceCandidates(
  inventory: Inventory,
  filledReferenceNumbers: Set<string> = new Set(),
): Promise<Array<Record<string, unknown>>> {
  const stationarySector = INVENTORY_STRUCTURE.find(
    (sector) => sector.sectorName === "stationary-energy",
  );
  if (!stationarySector) {
    return [];
  }

  const allSources = await DataSourceService.findAllSources(
    inventory.inventoryId,
  );
  const stationarySources = allSources.filter((source: any) => {
    const sectorId =
      source.subSector?.sectorId ?? source.subCategory?.subsector?.sectorId;
    return (
      sectorId === stationarySector.sectorId &&
      !sourceMatchesFilledReference(source, filledReferenceNumbers)
    );
  });
  const { applicableSources, removedSources } = DataSourceService.filterSources(
    inventory,
    stationarySources,
  );
  const populationScaleFactors =
    await DataSourceService.findPopulationScaleFactors(
      inventory,
      applicableSources,
    );

  const applicableWithData = await Promise.all(
    applicableSources.map(async (source: any) => {
      const result = await DataSourceService.getSourceWithData(
        source,
        inventory,
        populationScaleFactors.countryPopulationScaleFactor,
        populationScaleFactors.regionPopulationScaleFactor,
        populationScaleFactors.populationIssue,
      );
      return result;
    }),
  );

  const candidates: Array<Record<string, unknown>> = [];
  for (const removedSource of removedSources) {
    candidates.push(
      buildRemovedSourceCandidate({
        inventory,
        removedSource,
      }),
    );
  }

  for (const item of applicableWithData) {
    if (item.error) {
      candidates.push(
        buildSourceCandidate({
          inventory,
          item,
          applicabilityStatus: "failed",
          applicabilityIssues: [item.error],
          failureReason: item.error,
        }),
      );
      continue;
    }

    candidates.push(
      buildSourceCandidate({
        inventory,
        item,
        applicabilityStatus: "applicable",
      }),
    );
  }

  return candidates;
}

function buildSourceCandidate(params: {
  inventory: Inventory;
  item: Record<string, any>;
  applicabilityStatus: CandidateApplicabilityStatus;
  applicabilityIssues?: string[];
  failureReason?: string | null;
}): Record<string, unknown> {
  const source = params.item.source ?? params.item;
  const data = params.item.data;
  const sourceScope = buildSourceScope(source);
  const geographyMatch = resolveGeographyMatch(
    params.inventory,
    source?.geographicalLocation,
  );

  return {
    datasource_id: source.datasourceId,
    name: source.datasourceName ?? null,
    publisher_name: source.publisher?.name ?? null,
    retrieval_method: source.retrievalMethod ?? null,
    dataset_name: source.datasourceName ?? null,
    dataset_year: source.startYear ?? null,
    url: source.url ?? source.datasetUrl ?? source.publisher?.url ?? null,
    geography_match: geographyMatch,
    source_scope: sourceScope,
    source_data: data ?? null,
    normalized_rows: normalizeSourceRows(data),
    applicability_status: params.applicabilityStatus,
    applicability_issues: params.applicabilityIssues ?? [],
    failure_reason: params.failureReason ?? null,
    quality_score:
      params.applicabilityStatus === "applicable" &&
      source.startYear === params.inventory.year
        ? "1"
        : null,
    confidence_notes:
      params.failureReason ??
      buildConfidenceNotes({
        geographyMatch,
        source,
        inventory: params.inventory,
      }),
  };
}

function buildRemovedSourceCandidate(params: {
  inventory: Inventory;
  removedSource: RemovedSourceResult;
}): Record<string, unknown> {
  return buildSourceCandidate({
    inventory: params.inventory,
    item: { source: params.removedSource.source },
    applicabilityStatus: "removed",
    applicabilityIssues: [params.removedSource.reason],
    failureReason: params.removedSource.reason,
  });
}

function buildSourceScope(
  source: Record<string, any>,
): Record<string, unknown> {
  const subCategory = source.subCategory ?? null;
  const subSector = subCategory?.subsector ?? source.subSector ?? null;

  return {
    sector_id: subSector?.sectorId ?? null,
    sector_name: "Stationary Energy",
    sector_reference_number: "I",
    subsector_id: subSector?.subsectorId ?? null,
    subsector_name: friendlyLabel(
      subSector?.subsectorName ?? subSector?.referenceNumber ?? null,
    ),
    subsector_reference_number: subSector?.referenceNumber ?? null,
    subcategory_id: subCategory?.subcategoryId ?? null,
    subcategory_name: friendlyLabel(
      subCategory?.subcategoryName ?? subCategory?.referenceNumber ?? null,
    ),
    subcategory_reference_number: subCategory?.referenceNumber ?? null,
    scope_id: subCategory?.scope?.scopeId ?? subCategory?.scopeId ?? null,
    scope_name: scopeName(subCategory?.scope?.scopeName ?? null),
  };
}

function sourceMatchesFilledReference(
  source: Record<string, any>,
  filledReferenceNumbers: Set<string>,
): boolean {
  if (filledReferenceNumbers.size === 0) {
    return false;
  }

  const referenceNumber =
    source.subCategory?.referenceNumber ?? source.subSector?.referenceNumber;
  return Boolean(
    referenceNumber && filledReferenceNumbers.has(referenceNumber),
  );
}

function buildGuidanceContext(params: {
  locale: StationaryEnergyLocale;
  taxonomy: TaxonomyRow[];
  sourceCandidates: Array<Record<string, unknown>>;
}): GuidanceContext {
  const translation =
    STATIONARY_ENERGY.methodologies[0]?.translations[params.locale] ??
    STATIONARY_ENERGY.methodologies[0]?.translations.en;

  const scopeRules = Array.from(
    params.taxonomy.reduce((map, row) => {
      const key = `${row.scope_id ?? "none"}:${row.scope_name ?? "none"}`;
      const entry = map.get(key) ?? {
        scope_id: row.scope_id,
        scope_name: row.scope_name,
        rows: 0,
        subsectors: new Set<string>(),
      };
      entry.rows += 1;
      entry.subsectors.add(row.subsector_name);
      map.set(key, entry);
      return map;
    }, new Map<string, { scope_id: string | null; scope_name: string | null; rows: number; subsectors: Set<string> }>()),
  ).map(([, value]) => ({
    scope_id: value.scope_id,
    scope_name: value.scope_name,
    rows: value.rows,
    subsectors: Array.from(value.subsectors).sort(),
  }));

  const methodologySummaries = STATIONARY_ENERGY.methodologies.map(
    (methodology) => {
      const localeTranslation =
        methodology.translations[params.locale] ?? methodology.translations.en;
      return {
        methodology_id: methodology.id,
        methodology: localeTranslation.methodology,
        overview: localeTranslation.overview,
        scope: localeTranslation.scope ?? null,
        approach: localeTranslation.approach ?? null,
        data_requirements: (localeTranslation.data_requirements ?? []).slice(
          0,
          4,
        ),
        assumptions: (localeTranslation.assumptions ?? []).slice(0, 4),
        limitations: (localeTranslation.limitations ?? []).slice(0, 3),
      };
    },
  );

  const unitConventions = STATIONARY_ENERGY.methodologies.flatMap(
    (methodology) => {
      const localeTranslation =
        methodology.translations[params.locale] ?? methodology.translations.en;
      return (localeTranslation.parameters ?? [])
        .filter((parameter) => parameter.units)
        .map((parameter) => ({
          methodology_id: methodology.id,
          parameter: parameter.description,
          units: Array.isArray(parameter.units)
            ? parameter.units
            : [parameter.units],
        }));
    },
  );

  return {
    sector_overview: {
      sector: translation?.sector ?? "Stationary Energy",
      overview: translation?.overview ?? "",
    },
    scope_rules: scopeRules,
    taxonomy_labels: params.taxonomy.map((row) => ({
      subsector_id: row.subsector_id,
      subsector_name: row.subsector_name,
      subcategory_id: row.subcategory_id,
      subcategory_name: row.subcategory_name,
      scope_id: row.scope_id,
      scope_name: row.scope_name,
    })),
    methodology_summaries: methodologySummaries,
    unit_conventions: unitConventions,
    source_selection_rules: [
      "Use only stored Stationary Energy source candidates returned by CityCatalyst for this inventory.",
      "Prefer sources that match the city and inventory year exactly before broader geographic matches.",
      "Do not invent missing activity values, emission factors, or new sources outside the bounded context.",
    ],
    known_limits_or_gaps: [
      "The draft flow is limited to the Stationary Energy taxonomy rows loaded for the selected inventory.",
      "Only current CityCatalyst datasource candidates are eligible for source-backed recommendations.",
    ],
  };
}

function normalizeSourceRows(data: any): Array<Record<string, unknown>> {
  if (!data) {
    return [];
  }

  if (Array.isArray(data.records)) {
    return data.records.map((row: Record<string, unknown>) => row);
  }

  if (Array.isArray(data.rows)) {
    return data.rows.map((row: Record<string, unknown>) => row);
  }

  if (data.totals?.emissions) {
    return [
      {
        emissions_value: numericField(data.totals.emissions.co2eq_100yr),
        emissions_unit: "tCO2e",
        scale_factor: numericField(data.scaleFactor),
        issue: stringField(data.issue),
      },
    ];
  }

  return typeof data === "object" ? [data] : [];
}

function resolveLocale(locale?: string | null): StationaryEnergyLocale {
  const normalized = String(locale ?? "")
    .trim()
    .toLowerCase();
  const candidates = Object.values(LANGUAGES);
  const match = candidates.find(
    (candidate) =>
      normalized === candidate || normalized.startsWith(`${candidate}-`),
  );
  return (match ?? LANGUAGES.en) as StationaryEnergyLocale;
}

function friendlyLabel(value: string | number | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  return text
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scopeName(value: string | number | null | undefined): string | null {
  if (value == null || value === "") {
    return null;
  }

  const text = String(value);
  return text.toLowerCase().startsWith("scope ") ? text : `Scope ${text}`;
}

function numericField(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null || value === "") {
      continue;
    }
    return String(value);
  }

  return null;
}

function stringField(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) {
      continue;
    }

    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return null;
}

function bigintToString(value: bigint | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
}

function resolveGeographyMatch(
  inventory: Inventory,
  geographicalLocation: string | null | undefined,
): "city" | "locode" | "region" | "country" | "global" | "unknown" {
  const locations = String(geographicalLocation ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (locations.includes("EARTH")) {
    return "global";
  }
  if (inventory.city?.locode && locations.includes(inventory.city.locode)) {
    return "city";
  }

  const countryLocode = inventory.city?.locode?.split(" ")[0];
  if (countryLocode && locations.includes(countryLocode)) {
    return "country";
  }
  if (inventory.city?.region && locations.includes(inventory.city.region)) {
    return "region";
  }
  return "unknown";
}

function buildConfidenceNotes(params: {
  geographyMatch: string;
  source: Record<string, any>;
  inventory: Inventory;
}): string {
  const notes = [];
  if (params.geographyMatch === "city") {
    notes.push("City-level source");
  } else if (params.geographyMatch === "country") {
    notes.push("Country-level source");
  } else if (params.geographyMatch === "region") {
    notes.push("Region-level source");
  }

  if (
    params.source.startYear &&
    params.source.startYear === params.inventory.year
  ) {
    notes.push("matches the inventory year");
  }

  return notes.length > 0
    ? `${notes.join(" ")}.`
    : "Applicable source candidate returned by CityCatalyst.";
}
