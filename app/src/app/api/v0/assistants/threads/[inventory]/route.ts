import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import { PopulationEntry, findClosestYear } from "@/util/helpers";
import { PopulationAttributes } from "@/models/Population";

export const POST = apiHandler(async (req, { params, session }) => {
  const { content } = await req.json();

  const openai = setupOpenAI();

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
    [
      {
        model: db.models.InventoryValue,
        as: "inventoryValues",
        include: [
          {
            model: db.models.GasValue,
            as: "gasValues",
            include: [
              { model: db.models.EmissionsFactor, as: "emissionsFactor" },
            ],
          },
          {
            model: db.models.DataSource,
            attributes: ["datasourceId", "sourceType"],
            as: "dataSource",
          },
        ],
      },
      {
        model: db.models.City,
        as: "city",
        include: [
          {
            model: db.models.Population,
            as: "populations",
          },
        ],
      },
    ],
  );

  function createContext(inventory: Inventory): string {
    const inventoryYear = inventory.dataValues.year;

    const countryPopulations = inventory.city.populations.filter(
      (pop) => !!pop.countryPopulation,
    );
    const countryPopulationObj = findClosestYear(
      countryPopulations as PopulationEntry[],
      inventoryYear!,
    ) as PopulationAttributes;

    const countryPopulation = countryPopulationObj?.countryPopulation;
    const countryPopulationYear = countryPopulationObj?.year;

    const regionPopulations = inventory.city.populations.filter(
      (pop) => !!pop.regionPopulation,
    );
    const regionPopulationObj = findClosestYear(
      regionPopulations as PopulationEntry[],
      inventoryYear!,
    ) as PopulationAttributes;

    const regionPopulation = regionPopulationObj?.regionPopulation;
    const regionPopulationYear = regionPopulationObj?.year;

    const cityPopulations = inventory.city.populations.filter(
      (pop) => !!pop.population,
    );
    const cityPopulationObj = findClosestYear(
      cityPopulations as PopulationEntry[],
      inventoryYear!,
    ) as PopulationAttributes;

    const cityPopulation = cityPopulationObj?.population;
    const cityPopulationYear = cityPopulationObj?.year;

    const {
      name: cityName,
      region: regionName,
      country: countryName,
      countryLocode: countryLocode,
      area: cityArea,
    } = inventory.city.dataValues;

    const numInventoryValues = inventory.inventoryValues?.length;
    const userName = session?.user.name;

    return `<context>
  + Name of the currently logged in user: ${userName},
  + Name of city name that the inventory is being created for: ${cityName},
  + Name of the corresponding region: ${regionName},
  + Name of the corresponding country: ${countryName},
  + UN/LOCODE of the corresponding country: ${countryLocode},
  + Population of the city ${cityName} for the year ${cityPopulationYear} (closest known value to the inventory year): ${cityPopulation},
  + Population of the region ${regionName} for the year ${regionPopulationYear} (closest known value to the inventory year): ${regionPopulation},
  + Population of the country ${countryName} for the year ${countryPopulationYear} (closest known value to the inventory year): ${countryPopulation},
  + Area of the city ${cityName} in km\u00B2: ${cityArea},
  + Year for which the the inventory is being created: ${inventoryYear},
  + Current number of inventory values for this city: ${numInventoryValues}.
  </context>`;
  }

  const context = createContext(inventory);

  const thread = await openai.beta.threads.create();

  // Add an optional context message on the thread
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: context,
  });

  // Add custom initial message to newly created thread.
  await openai.beta.threads.messages.create(thread.id, {
    role: "assistant",
    content: content,
  });

  return NextResponse.json({ threadId: thread.id });
});
