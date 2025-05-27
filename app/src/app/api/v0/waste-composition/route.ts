import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { db } from "@/models";
import { NextResponse } from "next/server";
import { literal, Op } from "sequelize";
import { z } from "zod";

const getWasteCompositionParams = z.object({
  inventoryId: z.string().uuid(),
  methodologyName: z.string(),
});

export const GET = apiHandler(async (_req: Request, context) => {
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const url = new URL(_req.url);
  const searchParams = url.searchParams;
  const inventoryId = searchParams.get("inventoryId");
  const methodologyName = searchParams.get("methodologyName");

  if (!inventoryId || !methodologyName) {
    throw new createHttpError.BadRequest(
      "Missing inventoryId or methodologyName",
    );
  }

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

  const parsedLocode = "world"; // TODO extend to use city Country locode;

  const formulaValues = await db.models.FormulaInput.findAll({
    where: {
      parameterCode: {
        [Op.iLike]: `%cc_%`,
      },
      methodologyName: methodologyName,
      region: parsedLocode,
    },
  });

  return NextResponse.json({ data: formulaValues });
});
