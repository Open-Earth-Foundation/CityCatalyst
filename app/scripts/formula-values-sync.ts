import { db } from "@/models";
import { DataSourceI18nCreationAttributes } from "@/models/DataSourceI18n";
import { PublisherCreationAttributes } from "@/models/Publisher";
import { MethodologyCreationAttributes } from "@/models/Methodology";
import { FormulaInputCreationAttributes } from "@/models/FormulaInput";
import { DataSourceFormulaInputCreationAttributes } from "@/models/DataSourceFormulaInput";
import env from "@next/env";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";

interface FormulaInputPublisher {
  name: string;
  URL: string;
  publisher_id: string;
}

interface FormulaInputDataSource {
  datasource_name: string;
  dataset_name: string;
  URL: string;
  publisher_id: string;
  datasource_id: string;
}

interface FormulaInputMethodology {
  methodology_id: string;
  methodology: string;
  methodology_url: string | null;
  datasource_id: string;
}

interface FormulaInputValue {
  gas: string;
  parameter_code: string;
  parameter_name: string;
  methodology_name: string;
  gpc_refno: string;
  year: number | null;
  formula_input_value: number;
  formula_input_units: string;
  formula_name: string;
  metadata: string;
  region: string | null;
  actor_id: string;
  datasource: string;
  rnk: number;
  methodology_id: string;
  formulainput_id: string;
}

interface FormulaInputDataSourceMapping {
  datasource_id: string;
  formula_input_id: string;
}

interface APIResponse<T> {
  [key: string]: T[];
}

// Utility function for snake_case to camelCase conversion (unused but kept for potential future use)
// function snakeToCamel(str: string): string {
//   return str
//     .toLowerCase()
//     .replace(/([-_][a-z])/g, (group) =>
//       group.toUpperCase().replace("-", "").replace("_", ""),
//     );
// }

async function fetchFormulaData(baseUrl: string) {
  logger.info("Fetching formula input data from global API...");
  
  const endpoints = [
    { path: "/formula_input/publisher", key: "formula_input_publisher" },
    { path: "/formula_input/datasource", key: "formula_input_datasource" },
    { path: "/formula_input/methodology", key: "formula_input_methodology" },
    { path: "/formula_input/formula_input", key: "formula_input" },
    { path: "/formula_input/formulainput_datasource", key: "formula_input_datasource_mapping" }
  ];

  const results: Record<string, any> = {};

  const responsePairs = await Promise.all(endpoints.map(async (endpoint) => {
    const url = `${baseUrl}${endpoint.path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new createHttpError.InternalServerError(
        `Failed to fetch ${endpoint.path} with error ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    return [endpoint.key, data];
  });
  
  const results = _.zipObject(responsePairs);
    
    const data = await response.json();
    // Special case handling for the formulainput_datasource endpoint
    // The API returns data with key "formula_input_datasource" but we already use that key
    // for the /formula_input/datasource endpoint. To avoid collision in our results object,
    // we store this endpoint's data under "formula_input_datasource_mapping" instead.
    if (endpoint.path === "/formula_input/formulainput_datasource") {
      results[endpoint.key] = data["formula_input_datasource"] || [];
    } else {
      results[endpoint.key] = data[endpoint.key] || [];
    }
  }

  return results;
}

function transformFormulaData(apiData: Record<string, any>) {
  const publishers: PublisherCreationAttributes[] = apiData.formula_input_publisher.map((pub: FormulaInputPublisher) => ({
    publisherId: pub.publisher_id,
    name: pub.name,
    url: pub.URL,
  }));

  const dataSources: DataSourceI18nCreationAttributes[] = apiData.formula_input_datasource.map((ds: FormulaInputDataSource) => ({
    datasourceId: ds.datasource_id,
    datasourceName: ds.datasource_name,
    // TODO: Consider changing from { user: ... } to { en: ... } for clarity
    // Currently matches the pattern used in the original seeder
    datasetName: ds.dataset_name ? JSON.stringify({ user: ds.dataset_name }) : null,
    sourceType: "formula_input", // Default value
    datasetUrl: ds.URL,
    datasetDescription: null,
    accessType: "public", // Default value
    geographicalLocation: "global", // Default value
    startYear: null,
    endYear: null,
    latestAccountingYear: null,
    frequencyOfUpdate: null,
    spatialResolution: null,
    language: "en", // Default value
    accessibility: "free", // Default value
    dataQuality: null,
    notes: `Formula input data from ${ds.datasource_name}. For more details see ${ds.URL}`,
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

  const methodologies: MethodologyCreationAttributes[] = apiData.formula_input_methodology.map((meth: FormulaInputMethodology) => ({
    methodologyId: meth.methodology_id,
    methodology: meth.methodology,
    methodologyUrl: meth.methodology_url,
    datasourceId: meth.datasource_id,
  }));

  const formulaInputs: FormulaInputCreationAttributes[] = apiData.formula_input.map((fi: FormulaInputValue) => ({
    formulaInputId: fi.formulainput_id,
    gas: fi.gas,
    parameterCode: fi.parameter_code,
    parameterName: fi.parameter_name,
    methodologyName: fi.methodology_name,
    gpcRefno: fi.gpc_refno,
    year: fi.year,
    formulaInputValue: fi.formula_input_value,
    formulaInputUnits: fi.formula_input_units,
    formulaName: fi.formula_name,
    metadata: fi.metadata ? JSON.parse(fi.metadata) : null,
    region: fi.region || "global",
    actorId: fi.actor_id,
    datasource: fi.datasource,
    rnk: fi.rnk,
    methodologyId: fi.methodology_id,
  }));

  const dataSourceFormulaInputs: DataSourceFormulaInputCreationAttributes[] = apiData.formula_input_datasource_mapping.map((mapping: FormulaInputDataSourceMapping) => ({
    datasourceId: mapping.datasource_id,
    formulaInputId: mapping.formula_input_id,
  }));

  return {
    publishers,
    dataSources,
    methodologies,
    formulaInputs,
    dataSourceFormulaInputs
  };
}

async function initializeDatabase() {
  if (!db.initialized) {
    await db.initialize();
  }
}

async function findOrCreateCatalogue() {
  let catalogue = await db.models.Catalogue.findOne({
    where: { type: "formula_values" },
  });
  if (!catalogue) {
    catalogue = await db.models.Catalogue.create({
      type: "formula_values",
      lastUpdate: new Date(0),
    });
  }
  return catalogue;
}

async function syncPublishers(publishers: PublisherCreationAttributes[]) {
  logger.debug("Syncing publishers...");
  await Promise.all(
    publishers.map((publisher) => db.models.Publisher.upsert(publisher))
  );
  logger.info(`Synced ${publishers.length} publishers`);
}

async function syncDataSources(dataSources: DataSourceI18nCreationAttributes[]) {
  logger.debug("Syncing data sources...");
  await Promise.all(
    dataSources.map((dataSource) => db.models.DataSource.upsert(dataSource))
  );
  logger.info(`Synced ${dataSources.length} data sources`);
}

async function syncMethodologies(methodologies: MethodologyCreationAttributes[]) {
  logger.debug("Syncing methodologies...");
  await Promise.all(
    methodologies.map((methodology) => db.models.Methodology.upsert(methodology))
  );
  logger.info(`Synced ${methodologies.length} methodologies`);
}

async function syncFormulaInputs(formulaInputs: FormulaInputCreationAttributes[]) {
  logger.debug("Syncing formula inputs...");
  await Promise.all(
    formulaInputs.map((formulaInput) => db.models.FormulaInput.upsert(formulaInput))
  );
  logger.info(`Synced ${formulaInputs.length} formula inputs`);
}

async function syncFormulaInputRelationships(relationships: DataSourceFormulaInputCreationAttributes[]) {
  logger.debug("Syncing datasource-formulainput relationships...");
  await db.models.DataSourceFormulaInput.bulkCreate(relationships, {
    ignoreDuplicates: true
  });
  logger.info(`Synced ${relationships.length} datasource-formulainput relationships`);
}

async function syncFormulaValues() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);
  const SKIP_TIMESTAMP_CHECK = process.env.SKIP_TIMESTAMP_CHECK === "true";

  const GLOBAL_API_URL =
    process.env.GLOBAL_API_URL || "http://api.citycatalyst.io";
  logger.info(`Using global API at ${GLOBAL_API_URL}`);

  try {
    await initializeDatabase();
    const catalogue = await findOrCreateCatalogue();
    const catalogueUrl = `${GLOBAL_API_URL}/api/v0`;

    if (!SKIP_TIMESTAMP_CHECK) {
      logger.warn("Timestamp checking not implemented for formula values yet, proceeding with sync");
    }

    // Fetch all formula data from the global API
    const apiData = await fetchFormulaData(catalogueUrl);
    
    // Transform the data to match local model expectations
    const transformedData = transformFormulaData(apiData);

    logger.info("Starting formula values sync...");

    // Sync all components in sequence to avoid database conflicts
    await syncPublishers(transformedData.publishers);
    await syncDataSources(transformedData.dataSources);
    await syncMethodologies(transformedData.methodologies);
    await syncFormulaInputs(transformedData.formulaInputs);
    await syncFormulaInputRelationships(transformedData.dataSourceFormulaInputs);

    await catalogue.update({ lastUpdate: new Date() });
    logger.info("Formula values sync completed successfully!");

  } catch (error) {
    console.error("Error syncing formula values:", error);
    throw error;
  } finally {
    await db.sequelize?.close();
  }
}

syncFormulaValues();