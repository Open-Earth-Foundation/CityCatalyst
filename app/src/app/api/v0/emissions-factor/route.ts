import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { Op } from "sequelize";
import { fetchEmissionsFactorRequest } from "@/util/validation";

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

  let parsedLocode = null;

  if (regionLocode) {
    parsedLocode = regionLocode;
  }

  if (inventoryId && !regionLocode) {
    let city = await db.models.City.findOne({
      attributes: ["regionLocode"],
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
    parsedLocode = city?.regionLocode;
  }

  // use units from the emission factors first
  // if custom

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
  }

  const emissionsFactors = await db.models.EmissionsFactor.findAll({
    where: whereClause,
    include: [{ model: db.models.DataSource, as: "dataSources" }],
  });

  let output = emissionsFactors.filter(({ actorId }) =>
    ["world", parsedLocode].includes(actorId as string),
  );

  return NextResponse.json({ data: output });
});
