import { apiHandler } from "@/util/api";
import { db } from "@/models";
import UserService from "@/backend/UserService";
import { NextResponse } from "next/server";
import { patchInventoryValue } from "@/util/validation";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );
  const inventoryValues = await db.models.InventoryValue.findAll({
    where: {
      subSectorId: params.subsector,
      inventoryId: inventory.inventoryId,
    },
    include: [
      { model: db.models.DataSource, as: "dataSource" },
      {
        model: db.models.SubCategory,
        as: "subCategory",
      },
      { model: db.models.Sector, as: "sector" },
      { model: db.models.SubSector, as: "subSector" },
    ],
  });

  return NextResponse.json({ data: inventoryValues });
});

// update if it exists, create if it doesn't
export const PATCH = apiHandler(async (req, { params, session }) => {
  const body = patchInventoryValue.parse(await req.json());

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const subSector = await db.models.SubSector.findOne({
    where: { subsectorId: params.subsector },
  });
  if (!subSector) {
    throw new createHttpError.NotFound(
      "Sub sector not found: " + params.subsector,
    );
  }

  let inventoryValue = await db.models.InventoryValue.findOne({
    where: {
      inventoryId: inventory.inventoryId,
      subSectorId: params.subsector,
      gpcReferenceNumber: body.gpcReferenceNumber,
    },
  });

  if (inventoryValue) {
    inventoryValue = await inventoryValue.update({
      ...body,
      id: inventoryValue.id,
    });
  } else {
    inventoryValue = await db.models.InventoryValue.create({
      ...body,
      id: randomUUID(),
      subSectorId: subSector.subsectorId,
      sectorId: subSector.sectorId,
      inventoryId: params.inventory,
      gpcReferenceNumber: body.gpcReferenceNumber,
    });
  }

  await inventoryValue.save();

  return NextResponse.json({ data: inventoryValue });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  const inventoryValue = await db.models.InventoryValue.findOne({
    where: {
      inventoryId: inventory.inventoryId,
      subSectorId: params.subsector,
    },
  });

  if (!inventoryValue) {
    throw new createHttpError.NotFound(
      "Inventory value not found for subsector: " + params.subsector,
    );
  }

  await inventoryValue.destroy();

  return NextResponse.json({ data: inventoryValue });
});
