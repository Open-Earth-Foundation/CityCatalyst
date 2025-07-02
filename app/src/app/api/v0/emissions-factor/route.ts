import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { Op } from "sequelize";
import { fetchEmissionsFactorRequest } from "@/util/validation";
import { logger } from "@/services/logger";

const filterMappings: Record<string, any> = {
  "fuel-type-wood/wood-waste": "fuel-type-wood-wood-waste",
};

export const POST = apiHandler(async (req: NextRequest, _context: {}) => {
  const body = fetchEmissionsFactorRequest.parse(await req.json());
  const {
    inventoryId,
    referenceNumber,
    methodologyId,
    regionLocode,
    metadata,
  } = body;

  if (inventoryId && regionLocode) {
    throw new createHttpError.BadRequest(
      "Cannot have both inventoryID and regionLocode as part of request params",
    );
  }

  let city_name = null;
  let region_name = null;
  let region_locode = null;
  let country = null;
  let countryLocode = null;

  let parsedLocode = null;

  if (regionLocode) {
    parsedLocode = regionLocode;
  }

  if (inventoryId && !regionLocode) {
    let city = await db.models.City.findOne({
      include: [
        {
          model: db.models.Inventory,
          as: "inventories",
          attributes: [],
          where: {
            inventoryId: inventoryId,
          },
          required: true,
        },
      ],
    });
    city_name = city?.name;
    region_name = city?.region;
    region_locode = city?.regionLocode;
    country = city?.country;
    countryLocode = city?.countryLocode;
  }

  // use units from the emission factors first

  let whereClause: { [k: string]: any } = {};
  // don't return emissions factors from specific inventories

  if (!!metadata) {
    let andCondition = [];
    for (let key in metadata) {
      let clause = {
        [Op.or]: [
          {
            [`metadata.${key}`]: "nan",
          },
        ],
      };
      let orConditions = clause[Op.or];
      if (Array.isArray(metadata[key])) {
        metadata[key].forEach((value) => {
          orConditions.push({
            [`metadata.${key}`]: filterMappings[value] || value,
          });
        });
      } else {
        orConditions.push({
          [`metadata.${key}`]:
            (filterMappings[metadata[key]] as string) || metadata[key], // we need to have some mapping
        });
      }
      andCondition.push(clause);
    }

    whereClause = {
      [Op.and]: andCondition,
    };
  }

  whereClause.inventoryId = { [Op.is]: null };

  if (!!referenceNumber) {
    whereClause.gpcReferenceNumber = referenceNumber;
  }

  if (methodologyId) {
    if (methodologyId.includes("fuel-combustion"))
      whereClause.methodologyName = "fuel-combustion-consumption";
    if (methodologyId.includes("scaled"))
      whereClause.methodologyName = "sampling-scaled-data";
    if (methodologyId.includes("modeled-data"))
      whereClause.methodologyName = "modeled-data";
    if (methodologyId.includes("electricity-consumption"))
      whereClause.methodologyName = "electricity-consumption";
    if (methodologyId.includes("energy-consumption"))
      whereClause.methodologyName = "energy-consumption";
  }

  // Unified priority list (order matters)
  const priorityArray: string[] = [];

  if (region_name) priorityArray.push(region_name);
  if (region_locode) priorityArray.push(region_locode);
  if (city_name) priorityArray.push(city_name);
  if (country) priorityArray.push(country);
  if (countryLocode) priorityArray.push(countryLocode);
  priorityArray.push("world"); // fallback for region

  whereClause = {
    ...whereClause,
    [Op.or]: [
      { region: { [Op.in]: priorityArray } },
      { actorId: { [Op.in]: priorityArray } },
    ],
  };

  const caseStatements = priorityArray
    .map((value, index) => {
      const rank = index + 1;
      const escapedValue = db.sequelize!.escape(value);
      return `
        WHEN "region" = ${escapedValue} THEN ${rank}
        WHEN "actor_id" = ${escapedValue} THEN ${rank}
      `;
    })
    .join("\n");

  const emissionsFactors = await db.models.EmissionsFactor.findAll({
    where: whereClause,
    include: [{ model: db.models.DataSource, as: "dataSources" }],
    order: [
      [
        db.sequelize!.literal(`
        CASE
          ${caseStatements}
          ELSE ${priorityArray.length + 1}
        END
      `),
        "ASC",
      ],
    ],
  });

  // const emissionsFactors = await db.models.EmissionsFactor.findAll({
  //   where: whereClause,
  //   include: [{ model: db.models.DataSource, as: "dataSources" }],
  // });

  logger.info(
    { locode: parsedLocode },
    "actor Id used to filter emissionsFactors ",
  );

  let output = emissionsFactors;

  return NextResponse.json({ data: output });
});
