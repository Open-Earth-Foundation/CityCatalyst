import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import uniqBy from "lodash/uniqBy";
import { Op } from "sequelize";

export const GET = apiHandler(async (req: NextRequest, _context: {}) => {
  const { searchParams } = new URL(req.url);
  const inventoryId = searchParams.get("inventoryId");
  const referenceNumber = searchParams.get("referenceNumber");
  const methodologyId = searchParams.get("methodologyId");

  const city = await db.models.City.findOne({
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

  let whereClause: { [k: string]: any } = {};
  // don't return emissions factors from specific inventories
  whereClause.inventoryId = { [Op.is]: null };

  if (methodologyId) {
    if (methodologyId.includes("fuel-combustion"))
      whereClause.methodologyName = "fuel-combustion-consumption";
    if (methodologyId.includes("scaled"))
      whereClause.methodologyName = "sampling-scaled-data";
    if (methodologyId.includes("modeled-data"))
      whereClause.methodologyName = "modeled-data";
  }

  if (!!referenceNumber) {
    whereClause.gpcReferenceNumber = referenceNumber;
  }

  const emissionsFactors = await db.models.EmissionsFactor.findAll({
    where: whereClause,
    include: [{ model: db.models.DataSource, as: "dataSources" }],
  });

  console.log(city?.regionLocode, "city?.regionLocode");

  let output = emissionsFactors.filter(({ actorId }) =>
    ["world", city?.regionLocode].includes(actorId as string),
  );

  // make unique by gas not by datasource id
  // output = uniqBy(output, (e) => e.dataSources[0].datasourceId);
  output = uniqBy(output, (e) => e.gas);

  if (output.length === 0) {
    throw new createHttpError.NotFound("Emissions factors not found");
  }

  return NextResponse.json({ data: output });
});
