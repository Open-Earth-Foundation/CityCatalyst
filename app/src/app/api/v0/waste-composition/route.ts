/**
 * @swagger
 * /api/v0/waste-composition:
 *   get:
 *     tags:
 *       - Waste Composition
 *     summary: Get waste composition formula inputs
 *     description: Returns formula input values (WCF_*) for the specified inventory and methodology, filtered by the city’s country LOCODE when available.
 *     parameters:
 *       - in: query
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: methodologyName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Formula input values returned.
 *       400:
 *         description: Missing inventoryId or methodologyName.
 *       401:
 *         description: Unauthorized.
 */
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

  const parsedLocode = city?.countryLocode ?? "world"; // TODO extend to use city Country locode;

  const formulaValues = await db.models.FormulaInput.findAll({
    where: {
      parameterCode: {
        [Op.iLike]: `%WCF_%`,
      },
      methodologyName: methodologyName,
      actorId: parsedLocode,
    },
  });

  return NextResponse.json({ data: formulaValues });
});
