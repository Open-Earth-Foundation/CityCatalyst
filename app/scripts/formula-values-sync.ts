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

function snakeToCamel(str: string): string {
  return str
    .toLowerCase()
    .replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace("-", "").replace("_", ""),
    );
}

async function fetchFormulaData(baseUrl: string) {
  console.log("Fetching formula input data from global API...");
  
  const endpoints = [
    { path: "/formula_input/publisher", key: "formula_input_publisher" },
    { path: "/formula_input/datasource", key: "formula_input_datasource" },
    { path: "/formula_input/methodology", key: "formula_input_methodology" },
    { path: "/formula_input/formula_input", key: "formula_input" },
    { path: "/formula_input/formulainput_datasource", key: "formula_input_datasource" }
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
    results[endpoint.key] = data[endpoint.key] || [];
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

  const dataSourceFormulaInputs: DataSourceFormulaInputCreationAttributes[] = apiData.formula_input_datasource.map((mapping: FormulaInputDataSourceMapping) => ({
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

async function syncFormulaValues() {
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
    where: { type: "formula_values" },
  });
  if (!catalogue) {
    catalogue = await db.models.Catalogue.create({
      type: "formula_values",
      lastUpdate: new Date(0), // UNIX epoch as default value
    });
  }

  const catalogueUrl = `${GLOBAL_API_URL}/api/v0`;
  let lastUpdate = 0;

  // For now, we'll skip timestamp checking since the formula endpoints don't have a last-update endpoint
  // In the future, you might want to add a /api/v0/formula_input/last-update endpoint
  if (!SKIP_TIMESTAMP_CHECK) {
    console.warn("Timestamp checking not implemented for formula values yet, proceeding with sync");
  }

  try {
    // Fetch all formula data from the global API
    const apiData = await fetchFormulaData(catalogueUrl);
    
    // Transform the data to match local model expectations
    const transformedData = transformFormulaData(apiData);

    logger.debug("Starting formula values sync...");

    // Sync Publishers
    logger.debug("Syncing publishers...");
    for (const publisher of transformedData.publishers) {
      await db.models.Publisher.upsert(publisher);
    }
    console.log(`Synced ${transformedData.publishers.length} publishers`);

    // Sync DataSources
    logger.debug("Syncing data sources...");
    for (const dataSource of transformedData.dataSources) {
      await db.models.DataSource.upsert(dataSource);
    }
    console.log(`Synced ${transformedData.dataSources.length} data sources`);

    // Sync Methodologies
    logger.debug("Syncing methodologies...");
    for (const methodology of transformedData.methodologies) {
      await db.models.Methodology.upsert(methodology);
    }
    console.log(`Synced ${transformedData.methodologies.length} methodologies`);

    // Sync Formula Inputs
    logger.debug("Syncing formula inputs...");
    for (const formulaInput of transformedData.formulaInputs) {
      await db.models.FormulaInput.upsert(formulaInput);
    }
    console.log(`Synced ${transformedData.formulaInputs.length} formula inputs`);

    // Sync DataSource-FormulaInput relationships
    logger.debug("Syncing datasource-formulainput relationships...");
    for (const mapping of transformedData.dataSourceFormulaInputs) {
      await db.models.DataSourceFormulaInput.upsert(mapping);
    }
    console.log(`Synced ${transformedData.dataSourceFormulaInputs.length} datasource-formulainput relationships`);

    await catalogue.update({ lastUpdate: new Date() });
    logger.debug("Updated Catalogue, formula values sync complete!");

  } catch (error) {
    console.error("Error syncing formula values:", error);
    throw error;
  } finally {
    await db.sequelize?.close();
  }
}

syncFormulaValues();