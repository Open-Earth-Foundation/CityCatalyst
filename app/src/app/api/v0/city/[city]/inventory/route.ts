import { db } from "@/models";
import { SectorValue } from "@/models/SectorValue";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const body = createInventoryRequest.parse(await req.json());

  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  return await db.sequelize!.transaction(async (transaction) => {
    const inventory = await db.models.Inventory.create(
      {
        inventoryId: randomUUID(),
        cityId: city.cityId,
        ...body,
      },
      { transaction },
    );

    const sectors = await db.models.Sector.findAll({ transaction });
    const sectorValues = sectors.map((sector) => ({
      sectorValueId: randomUUID(),
      sectorId: sector.sectorId,
    }));
    await db.models.SectorValue.bulkCreate(sectorValues);
    await inventory.addSectorValues(
      sectorValues.map((val) => new SectorValue(val)),
      { transaction },
    );

    return NextResponse.json({ data: inventory });
  });
});
