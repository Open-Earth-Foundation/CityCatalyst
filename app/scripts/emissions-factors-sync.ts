import { db } from "@/models";
import { DataSourceI18nCreationAttributes } from "@/models/DataSourceI18n";
import { PublisherCreationAttributes } from "@/models/Publisher";
import { MethodologyCreationAttributes } from "@/models/Methodology";
import { EmissionsFactorCreationAttributes } from "@/models/EmissionsFactor";
import { DataSourceEmissionsFactorCreationAttributes } from "@/models/DataSourceEmissionsFactor";
import env from "@next/env";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";

interface EmissionsFactorPublisher {
  name: string;
  URL: string;
  publisher_id: string;
}

interface EmissionsFactorDataSource {
  datasource_name: string;
  dataset_name: string;
  URL: string;
  publisher_id: string;
  datasource_id: string;
}

interface EmissionsFactorMethodology {
  methodology_id: string;
  methodology: string;
  methodology_url: string | null;
  datasource_id: string;
}

interface EmissionsFactorValue {
  id: string;
  gas: string;
  gpc_reference_number: string;
  scope: string;
  units: string;
  ar4_gwp: number | null;
  ar5_gwp: number | null;
  ar6_gwp: number | null;
  co2_equivalent_value: number;
  co2_equivalent_units: string;
  activity_value: number;
  activity_units: string;
  emissions_factor_value: number;
  year: number | null;
  region: string | null;
  source: string;
  reference: string;
  description: string;
  temporal_granularity: string;
  url: string;
  methodology_id: string;
  metadata: string;
  deprecated?: boolean;
}

interface EmissionsFactorDataSourceMapping {
  datasource_id: string;
  emissions_factor_id: string;
}

interface APIResponse<T> {
  [key: string]: T[];
}

async function fetchEmissionsFactorData(baseUrl: string) {
  console.log("Fetching emissions factor data from global API...");
  
  const endpoints = [
    { path: "/emissions_factor/publisher", key: "emissions_factor_publisher" },
    { path: "/emissions_factor/datasource", key: "emissions_factor_datasource" },
    { path: "/emissions_factor/methodology", key: "emissions_factor_methodologies" },
    { path: "/emissions_factor/emissions_factor", key: "emissions_factor" },
    { path: "/emissions_factor/emissions_factor_datasource", key: "emissions_factor_datasource_mapping" }
  ];

  const results: Record<string, any> = {};

  for (const endpoint of endpoints) {
    const url = `${baseUrl}${endpoint.path}`;
    console.log(`Fetching ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${endpoint.path} with error ${response.status} ${response.statusText}`
      );
    }
    
    const data = await response.json();
    // Special case handling for the emissions_factor_datasource endpoint
    // The API returns data with key "emissions_factor_datasource" but we already use that key
    // for the /emissions_factor/datasource endpoint (line 72). To avoid collision in our results object,
    // we store this endpoint's data under "emissions_factor_datasource_mapping" instead.
    // This is just for organizing the API responses temporarily - the actual database tables
    // (DataSourceEmissionsFactor) are determined by the transform function, not these keys.
    // TODO: Work with the global API team to make response keys more consistent to avoid this confusion
    if (endpoint.path === "/emissions_factor/emissions_factor_datasource") {
      results[endpoint.key] = data["emissions_factor_datasource"] || [];
    } else {
      results[endpoint.key] = data[endpoint.key] || [];
    }
  }

  return results;
}

function transformEmissionsFactorData(apiData: Record<string, any>) {
  const publishers: PublisherCreationAttributes[] = apiData.emissions_factor_publisher.map((pub: EmissionsFactorPublisher) => ({
    publisherId: pub.publisher_id,
    name: pub.name,
    url: pub.URL,
  }));

  const dataSources: DataSourceI18nCreationAttributes[] = apiData.emissions_factor_datasource.map((ds: EmissionsFactorDataSource) => ({
    datasourceId: ds.datasource_id,
    datasourceName: ds.datasource_name,
    // TODO: Consider changing from { user: ... } to { en: ... } for clarity
    // Currently matches the pattern used in the original seeder (20231114094254-emissions-factors.cjs)
    datasetName: ds.dataset_name ? JSON.stringify({ user: ds.dataset_name }) : null,
    sourceType: "emissions_factor",
    datasetUrl: ds.URL,
    datasetDescription: null,
    accessType: "public",
    geographicalLocation: "global",
    startYear: null,
    endYear: null,
    latestAccountingYear: null,
    frequencyOfUpdate: null,
    spatialResolution: null,
    language: "en",
    accessibility: "free",
    dataQuality: null,
    notes: `Emissions factor data from ${ds.datasource_name}. For more details see ${ds.URL}`,
    units: null,
    methodologyUrl: null,
    methodologyDescription: null,
    transformationDescription: null,
    publisherId: ds.publisher_id,
    retrievalMethod: "api",
    apiEndpoint: null,
    created: new Date(),
    lastUpdated: new Date(),
    priority: 1,
  }));

  const methodologies: MethodologyCreationAttributes[] = apiData.emissions_factor_methodologies.map((meth: EmissionsFactorMethodology) => ({
    methodologyId: meth.methodology_id,
    methodology: meth.methodology,
    methodologyUrl: meth.methodology_url,
    datasourceId: meth.datasource_id,
  }));

  // Create a map of methodology_id to methodology name for lookup
  const methodologyMap = new Map(
    apiData.emissions_factor_methodologies.map((meth: EmissionsFactorMethodology) => 
      [meth.methodology_id, meth.methodology]
    )
  );

  const emissionsFactors: EmissionsFactorCreationAttributes[] = apiData.emissions_factor.map((ef: EmissionsFactorValue) => ({
    id: ef.id,
    gas: ef.gas,
    gpcReferenceNumber: ef.gpc_reference_number,
    scope: ef.scope,
    units: ef.units,
    ar4Gwp: ef.ar4_gwp,
    ar5Gwp: ef.ar5_gwp,
    ar6Gwp: ef.ar6_gwp,
    co2EquivalentValue: ef.co2_equivalent_value,
    co2EquivalentUnits: ef.co2_equivalent_units,
    activityValue: ef.activity_value,
    activityUnits: ef.activity_units,
    emissionsFactorValue: ef.emissions_factor_value,
    year: ef.year,
    region: ef.region || "global",
    source: ef.source,
    reference: ef.reference,
    description: ef.description,
    temporalGranularity: ef.temporal_granularity,
    url: ef.url,
    methodologyId: ef.methodology_id,
    methodologyName: methodologyMap.get(ef.methodology_id) || null,
    metadata: ef.metadata ? (typeof ef.metadata === 'string' ? JSON.parse(ef.metadata) : ef.metadata) : null,
    deprecated: false,
  }));

  const dataSourceEmissionsFactors: DataSourceEmissionsFactorCreationAttributes[] = apiData.emissions_factor_datasource_mapping.map((mapping: EmissionsFactorDataSourceMapping) => ({
    datasourceId: mapping.datasource_id,
    emissionsFactorId: mapping.emissions_factor_id,
  }));

  return {
    publishers,
    dataSources,
    methodologies,
    emissionsFactors,
    dataSourceEmissionsFactors
  };
}

async function markExistingEmissionsFactorsAsDeprecated() {
  logger.debug("Marking existing emissions factors as deprecated...");
  await db.models.EmissionsFactor.update(
    { deprecated: true },
    { where: {} }
  );
}

async function syncPublishers(publishers: PublisherCreationAttributes[]) {
  logger.debug("Syncing publishers...");
  await Promise.all(
    publishers.map((publisher) => db.models.Publisher.upsert(publisher))
  );
  console.log(`Synced ${publishers.length} publishers`);
}

async function syncDataSources(dataSources: DataSourceI18nCreationAttributes[]) {
  logger.debug("Syncing data sources...");
  await Promise.all(
    dataSources.map((dataSource) => db.models.DataSource.upsert(dataSource))
  );
  console.log(`Synced ${dataSources.length} data sources`);
}

async function syncMethodologies(methodologies: MethodologyCreationAttributes[]) {
  logger.debug("Syncing methodologies...");
  await Promise.all(
    methodologies.map((methodology) => db.models.Methodology.upsert(methodology))
  );
  console.log(`Synced ${methodologies.length} methodologies`);
}

async function syncEmissionsFactorsData(emissionsFactors: EmissionsFactorCreationAttributes[]) {
  logger.debug("Syncing emissions factors...");
  await Promise.all(
    emissionsFactors.map((emissionsFactor) => db.models.EmissionsFactor.upsert(emissionsFactor))
  );
  console.log(`Synced ${emissionsFactors.length} emissions factors`);
}

async function syncDataSourceEmissionsFactorRelationships(relationships: DataSourceEmissionsFactorCreationAttributes[]) {
  logger.debug("Syncing datasource-emissionsfactor relationships...");
  await db.models.DataSourceEmissionsFactor.bulkCreate(relationships, {
    ignoreDuplicates: true
  });
  console.log(`Synced ${relationships.length} datasource-emissionsfactor relationships`);
}

async function deleteUnusedDeprecatedEmissionsFactors() {
  logger.debug("Deleting unused deprecated emissions factors...");
  await db.sequelize!.query(`
    DELETE FROM "EmissionsFactor" ef
    WHERE ef.deprecated = true AND ef.inventory_id IS NULL AND NOT EXISTS (
      SELECT FROM "GasValue" gv WHERE gv.emissions_factor_id = ef.id
    );
  `);
  console.log("Deleted unused deprecated emissions factors");
}

async function syncEmissionsFactors() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);
  const SKIP_TIMESTAMP_CHECK = process.env.SKIP_TIMESTAMP_CHECK === "true";

  const GLOBAL_API_URL =
    process.env.GLOBAL_API_URL || "http://api.citycatalyst.io";
  console.log("Using global API at", GLOBAL_API_URL);

  if (!db.initialized) {
    await db.initialize();
  }

  let catalogue = await db.models.Catalogue.findOne({
    where: { type: "emissions_factors" },
  });
  if (!catalogue) {
    catalogue = await db.models.Catalogue.create({
      type: "emissions_factors",
      lastUpdate: new Date(0),
    });
  }

  const catalogueUrl = `${GLOBAL_API_URL}/api/v0`;

  if (!SKIP_TIMESTAMP_CHECK) {
    console.warn("Timestamp checking not implemented for emissions factors yet, proceeding with sync");
  }

  try {
    // Mark existing emissions factors as deprecated
    await markExistingEmissionsFactorsAsDeprecated();

    // Fetch all emissions factor data from the global API
    const apiData = await fetchEmissionsFactorData(catalogueUrl);
    
    // Transform the data to match local model expectations
    const transformedData = transformEmissionsFactorData(apiData);

    logger.debug("Starting emissions factors sync...");

    // Sync all components
    await syncPublishers(transformedData.publishers);
    await syncDataSources(transformedData.dataSources);
    await syncMethodologies(transformedData.methodologies);
    await syncEmissionsFactorsData(transformedData.emissionsFactors);
    await syncDataSourceEmissionsFactorRelationships(transformedData.dataSourceEmissionsFactors);

    // Clean up deprecated emissions factors
    await deleteUnusedDeprecatedEmissionsFactors();

    await catalogue.update({ lastUpdate: new Date() });
    logger.debug("Updated Catalogue, emissions factors sync complete!");

  } catch (error) {
    console.error("Error syncing emissions factors:", error);
    throw error;
  } finally {
    await db.sequelize?.close();
  }
}

syncEmissionsFactors();