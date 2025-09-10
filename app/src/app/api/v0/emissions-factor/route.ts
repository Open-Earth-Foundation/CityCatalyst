/**
 * @swagger
 * /api/v0/emissions-factor:
 *   post:
 *     tags:
 *       - Emissions Factors
 *     summary: Fetch emissions factors
 *     description: Returns emissions factors filtered by inventory, region, methodology, reference number, and optional metadata. Do not send both inventoryId and regionLocode in the same request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventoryId:
 *                 type: string
 *                 description: Inventory ID to infer location context
 *               regionLocode:
 *                 type: string
 *                 description: Region LOCODE to infer location context
 *               referenceNumber:
 *                 type: string
 *               methodologyId:
 *                 type: string
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Matching emissions factors returned.
 *       400:
 *         description: Invalid parameters (e.g., both inventoryId and regionLocode provided).
 */
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
      logger.debug({orConditions, clause})
      andCondition.push(clause);
    }

    logger.debug({andCondition})
    whereClause = {
      [Op.and]: andCondition,
    };
  }

  whereClause.inventoryId = { [Op.is]: null };

  if (!!referenceNumber) {
    whereClause.gpcReferenceNumber = referenceNumber;
  }

  whereClause.methodologyName = methodologyId

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

  logger.debug({whereClause});

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

  logger.info(
    { locode: parsedLocode },
    "actor Id used to filter emissionsFactors ",
  );

  let output = emissionsFactors;

  return NextResponse.json({ data: output });
});
