import { db } from "@/models";
import env from "@next/env";
import { logger } from "@/services/logger";
import { Op } from "sequelize";

interface CountryEmissionsEntry {
  year: number;
  total_emissions: number;
}

interface OCCountryData {
  emissions: {
    [sourceId: string]: {
      data: CountryEmissionsEntry[];
    };
  };
}

async function fetchCountryEmissions(
  locode: string,
): Promise<OCCountryData | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL ||
    "https://app.openclimate.network";
  const url = `${baseUrl}/api/v1/actor/${locode}`;

  try {
    logger.info({ locode, url }, "Fetching country data from OpenClimate API");
    const response = await fetch(url);

    if (!response.ok) {
      logger.error(
        { status: response.status, locode },
        "Failed to fetch country data",
      );
      return null;
    }

    const json = await response.json();
    return json.data;
  } catch (error) {
    logger.error({ error, locode }, "Error fetching country data");
    return null;
  }
}

function extractEmissionsForYear(
  countryData: OCCountryData,
  year: number,
  useClosestYear: boolean = true,
): { emissions: number; yearUsed: number } | null {
  const keys = Object.keys(countryData.emissions || {});
  const sourceId = keys.find((id) => id.startsWith("UNFCCC"));

  if (!sourceId) {
    logger.warn("No UNFCCC emissions data source found");
    return null;
  }

  const emissionsData = countryData.emissions[sourceId].data;

  // Try exact match first
  let yearData = emissionsData.find((e) => e.year === year);

  // If no exact match and useClosestYear is enabled, find closest year
  if (!yearData && useClosestYear && emissionsData.length > 0) {
    // Sort by year descending and find the closest year <= requested year
    const sortedData = [...emissionsData].sort((a, b) => b.year - a.year);

    // First try to find the most recent year that's <= requested year
    yearData = sortedData.find((e) => e.year <= year);

    // If no year <= requested year, use the most recent available year
    if (!yearData) {
      yearData = sortedData[0];
    }

    if (yearData) {
      logger.info(
        { requestedYear: year, usedYear: yearData.year },
        "Using closest available year for emissions data",
      );
    }
  }

  if (!yearData) {
    logger.warn({ year }, "No emissions data found for year");
    return null;
  }

  return { emissions: yearData.total_emissions, yearUsed: yearData.year };
}

async function updateBrazilCountryEmissions() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  if (!db.initialized) {
    await db.initialize();
  }

  try {
    logger.info("Starting Brazil country emissions update script");

    // Find all Brazilian cities (locode starts with "BR ")
    const cities = await db.models.City.findAll({
      where: {
        locode: {
          [Op.like]: "BR %",
        },
      },
    });

    logger.info({ count: cities.length }, "Found Brazilian cities");

    if (cities.length === 0) {
      logger.info("No Brazilian cities found. Exiting.");
      await db.sequelize?.close();
      return;
    }

    // Fetch Brazil country emissions data once (all Brazilian cities share the same data)
    const countryData = await fetchCountryEmissions("BR");

    if (!countryData) {
      logger.error("Failed to fetch Brazil country emissions data. Exiting.");
      await db.sequelize?.close();
      return;
    }

    logger.info("Successfully fetched Brazil country emissions data");

    let totalInventories = 0;
    let updatedInventories = 0;
    let skippedInventories = 0;
    let failedInventories = 0;

    // Process each city
    for (const city of cities) {
      logger.info(
        { cityId: city.cityId, cityName: city.name, locode: city.locode },
        "Processing city",
      );

      // Find inventories for this city where totalCountryEmissions is null or 0
      const inventories = await db.models.Inventory.findAll({
        where: {
          cityId: city.cityId,
          [Op.or]: [
            { totalCountryEmissions: null as any },
            { totalCountryEmissions: 0 },
          ],
        },
      });

      totalInventories += inventories.length;

      if (inventories.length === 0) {
        logger.info(
          { cityId: city.cityId },
          "No inventories missing country emissions",
        );
        continue;
      }

      logger.info(
        { cityId: city.cityId, count: inventories.length },
        "Found inventories to update",
      );

      // Update each inventory
      for (const inventory of inventories) {
        if (!inventory.year) {
          logger.warn(
            { inventoryId: inventory.inventoryId },
            "Inventory missing year, skipping",
          );
          skippedInventories++;
          continue;
        }

        const result = extractEmissionsForYear(countryData, inventory.year);

        if (result === null) {
          logger.warn(
            {
              inventoryId: inventory.inventoryId,
              year: inventory.year,
            },
            "No emissions data found for year, skipping",
          );
          skippedInventories++;
          continue;
        }

        const { emissions, yearUsed } = result;

        try {
          await inventory.update({
            totalCountryEmissions: BigInt(emissions) as any,
          });

          logger.info(
            {
              inventoryId: inventory.inventoryId,
              cityName: city.name,
              inventoryYear: inventory.year,
              emissionsYear: yearUsed,
              emissions,
            },
            yearUsed !== inventory.year
              ? "Updated inventory with country emissions (using closest available year)"
              : "Updated inventory with country emissions",
          );
          updatedInventories++;
        } catch (error) {
          logger.error(
            {
              error,
              inventoryId: inventory.inventoryId,
              year: inventory.year,
            },
            "Failed to update inventory",
          );
          failedInventories++;
        }
      }
    }

    logger.info(
      {
        totalInventories,
        updatedInventories,
        skippedInventories,
        failedInventories,
      },
      "Brazil country emissions update complete",
    );

    if (updatedInventories > 0) {
      logger.info(
        `✅ Successfully updated ${updatedInventories} Brazilian city inventories with country emissions data`,
      );
    }
  } catch (error) {
    logger.error({ error }, "Error in update script");
  } finally {
    await db.sequelize?.close();
  }
}

updateBrazilCountryEmissions().catch((error) => {
  logger.error({ error }, "Unhandled error in script");
  process.exit(1);
});
