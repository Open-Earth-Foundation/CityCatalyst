import DataSourceService from "@/backend/DataSourceService";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import { Scope } from "@/models/Scope";
import { SubCategory } from "@/models/SubCategory";
import { InventoryValue } from "@/models/InventoryValue";
import { SubSector } from "@/models/SubSector";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { Op } from "sequelize";
import { z } from "zod";
import { logger } from "@/services/logger";
import { Publisher } from "@/models/Publisher";
import { findClosestYear, PopulationEntry } from "@/util/helpers";
import { PopulationAttributes } from "@/models/Population";
import { Inventory } from "@/models/Inventory";
import { maxPopulationYearDifference } from "@/util/constants";

const downscaledByCountryPopulation = "global_api_downscaled_by_population";
const downscaledByRegionPopulation =
  "global_api_downscaled_by_region_population";
const populationScalingRetrievalMethods = [
  downscaledByCountryPopulation,
  downscaledByRegionPopulation,
];

async function findPopulationScaleFactors(
  inventory: Inventory,
  sources: DataSource[],
) {
  let countryPopulationScaleFactor = 1;
  let regionPopulationScaleFactor = 1;
  let populationIssue: string | null = null;
  if (
    sources.some((source) =>
      populationScalingRetrievalMethods.includes(source.retrievalMethod ?? ""),
    )
  ) {
    const populations = await db.models.Population.findAll({
      where: {
        cityId: inventory.cityId,
        year: {
          [Op.between]: [
            inventory.year! - maxPopulationYearDifference,
            inventory.year! + maxPopulationYearDifference,
          ],
        },
      },
      order: [["year", "DESC"]], // favor more recent population entries
    });
    const cityPopulations = populations.filter((pop) => !!pop.population);
    const cityPopulation = findClosestYear(
      cityPopulations as PopulationEntry[],
      inventory.year!,
    );
    const countryPopulations = populations.filter(
      (pop) => !!pop.countryPopulation,
    );
    const countryPopulation = findClosestYear(
      countryPopulations as PopulationEntry[],
      inventory.year!,
    ) as PopulationAttributes;
    const regionPopulations = populations.filter(
      (pop) => !!pop.regionPopulation,
    );
    const regionPopulation = findClosestYear(
      regionPopulations as PopulationEntry[],
      inventory.year!,
    ) as PopulationAttributes;
    // TODO allow country downscaling to work if there is no region population?
    if (!cityPopulation || !countryPopulation || !regionPopulation) {
      // City is missing population/ region population/ country population for a year close to the inventory year
      populationIssue = "missing-population"; // translation key
    } else {
      countryPopulationScaleFactor =
        cityPopulation.population / countryPopulation.countryPopulation!;
      regionPopulationScaleFactor =
        cityPopulation.population / regionPopulation.regionPopulation!;
    }
  }

  return {
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  };
}

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const include = [
    {
      model: DataSource,
      as: "dataSources",
      include: [
        { model: Scope, as: "scopes" },
        { model: Publisher, as: "publisher" },
        {
          model: InventoryValue,
          as: "inventoryValues",
          required: false,
          where: { inventoryId: params.inventoryId },
        },
        { model: SubSector, as: "subSector" },
        {
          model: SubCategory,
          as: "subCategory",
          include: [
            { model: SubSector, as: "subsector" },
            { model: Scope, as: "scope" },
          ],
        },
      ],
    },
  ];

  const sectors = await db.models.Sector.findAll({ include });
  const subSectors = await db.models.SubSector.findAll({ include });
  const subCategories = await db.models.SubCategory.findAll({ include });

  const sectorSources = sectors.flatMap((sector) => sector.dataSources);
  const subSectorSources = subSectors.flatMap(
    (subSector) => subSector.dataSources,
  );
  const subCategorySources = subCategories.flatMap(
    (subCategory) => subCategory.dataSources,
  );

  const sources = sectorSources
    .concat(subSectorSources)
    .concat(subCategorySources);

  const { applicableSources, removedSources } = DataSourceService.filterSources(
    inventory,
    sources,
  );

  // determine scaling factor for downscaled sources
  const {
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  } = await findPopulationScaleFactors(inventory, applicableSources);

  // TODO add query parameter to make this optional?
  const sourceData = await Promise.all(
    applicableSources.map(async (source) => {
      const data = await DataSourceService.retrieveGlobalAPISource(
        source,
        inventory,
      );
      if (data instanceof String || typeof data === "string") {
        return { error: data as string, source };
      }
      let scaleFactor = 1.0;
      let issue: string | null = null;
      if (source.retrievalMethod === downscaledByCountryPopulation) {
        scaleFactor = countryPopulationScaleFactor;
        issue = populationIssue;
      } else if (source.retrievalMethod === downscaledByRegionPopulation) {
        scaleFactor = regionPopulationScaleFactor;
        issue = populationIssue;
      }
      return { source, data: { ...data, scaleFactor, issue } };
    }),
  );

  const successfulSources = sourceData.filter((source) => !source.error);
  const failedSources = sourceData.filter((source) => !!source.error);

  return NextResponse.json({
    data: successfulSources,
    removedSources,
    failedSources,
  });
});

const applySourcesRequest = z.object({
  dataSourceIds: z.array(z.string().uuid()),
});

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const body = applySourcesRequest.parse(await req.json());
  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const sources = await db.models.DataSource.findAll({
    where: { datasourceId: body.dataSourceIds },
    include: [
      { model: SubSector, required: false, as: "subSector" },
      {
        model: SubCategory,
        required: false,
        as: "subCategory",
        include: [
          {
            model: SubSector,
            required: false,
            as: "subsector",
          },
        ],
      },
    ],
  });
  if (!sources) {
    throw new createHttpError.NotFound("Sources not found");
  }
  const { applicableSources, removedSources } = DataSourceService.filterSources(
    inventory,
    sources,
  );
  const applicableSourceIds = applicableSources.map(
    (source) => source.datasourceId,
  );
  const invalidSources = sources.filter(
    (source) => !applicableSourceIds.includes(source.datasourceId),
  );
  const invalidSourceIds = invalidSources.map((source) => source.datasourceId);

  // TODO check if the user has made manual edits that would be overwritten
  // TODO create new versioning record

  const {
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  } = await findPopulationScaleFactors(inventory, applicableSources);

  // download source data and apply in database
  const sourceResults = await Promise.all(
    applicableSources.map(async (source) => {
      const result: { id: string; success: boolean; issue?: string } = {
        id: source.datasourceId,
        success: true,
        issue: undefined,
      };

      if (source.retrievalMethod === "global_api") {
        const sourceStatus = await DataSourceService.applyGlobalAPISource(
          source,
          inventory,
        );
        if (typeof sourceStatus === "string") {
          result.issue = sourceStatus;
          result.success = false;
        }
      } else if (
        populationScalingRetrievalMethods.includes(source.retrievalMethod ?? "")
      ) {
        if (populationIssue) {
          result.issue = populationIssue;
          result.success = false;
          return result;
        }
        let scaleFactor = 1.0;
        if (source.retrievalMethod === downscaledByCountryPopulation) {
          scaleFactor = countryPopulationScaleFactor;
        } else if (source.retrievalMethod === downscaledByRegionPopulation) {
          scaleFactor = regionPopulationScaleFactor;
        }
        const sourceStatus = await DataSourceService.applyGlobalAPISource(
          source,
          inventory,
          scaleFactor,
        );
        if (typeof sourceStatus === "string") {
          result.issue = sourceStatus;
          result.success = false;
        }
      } else {
        result.issue = `Unsupported retrieval method ${source.retrievalMethod} for data source ${source.datasourceId}`;
        logger.error(result.issue);
        result.success = false;
      }

      return result;
    }),
  );

  const successful = sourceResults
    .filter((result) => result.success)
    .map((result) => result.id);
  const failed = sourceResults
    .filter((result) => !result.success)
    .map((result) => result.id);
  const issues = sourceResults
    .filter((result) => !!result.issue)
    .reduce((acc: Record<string, string>, result) => {
      acc[result.id] = result.issue!;
      return acc;
    }, {});

  return NextResponse.json({
    data: {
      successful,
      failed,
      invalid: invalidSourceIds,
      issues,
      removedSources,
    },
  });
});
