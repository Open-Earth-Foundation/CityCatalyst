/**
 * @swagger
 * /api/v0/inventory/{inventory}/value/subsector/{subsector}:
 *   get:
 *     tags:
 *       - Inventory Values
 *     summary: List inventory values for a subsector
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: subsector
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inventory values returned.
 */
import { apiHandler } from "@/util/api";
import { db } from "@/models";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { NextResponse } from "next/server";
import { patchInventoryValue } from "@/util/validation";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import { Inventory } from "@/models/Inventory";

export const GET = apiHandler(async (_req, { params, session }) => {
  const { resource } = await PermissionService.canEditInventory(
    session,
    params.inventory,
  );

  const inventory = resource as Inventory;

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

/**
 * @swagger
 * /api/v0/inventory/{inventory}/value/subsector/{subsector}:
 *   patch:
 *     tags:
 *       - Inventory Values
 *     summary: Upsert inventory value in a subsector by GPC reference number
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: subsector
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gpcReferenceNumber]
 *             properties:
 *               gpcReferenceNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Inventory value updated or created.
 *       400:
 *         description: Invalid request.
 */
// update if it exists, create if it doesn't
export const PATCH = apiHandler(async (req, { params, session }) => {
  const body = patchInventoryValue.parse(await req.json());

  const { resource } = await PermissionService.canEditInventory(
    session,
    params.inventory,
  );

  const inventory = resource as Inventory;

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

  // check if data is marked as not occurring/ otherwise unavailable
  if (body.unavailableReason || body.unavailableExplanation) {
    if (!body.unavailableReason || !body.unavailableExplanation) {
      throw new createHttpError.BadRequest(
        "unavailableReason and unavailableExplanation need to both be provided if one is used",
      );
    }

    body.co2eq = undefined;
    body.co2eqYears = undefined;

    // for existing data, delete left over ActivityValues
    if (inventoryValue) {
      await db.models.ActivityValue.destroy({
        where: { inventoryValueId: inventoryValue.id },
      });
    }
  }

  if (inventoryValue) {
    inventoryValue = await inventoryValue.update({
      ...body,
      id: inventoryValue.id,
      datasourceId: body.unavailableReason ? null : inventoryValue.datasourceId,
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

/**
 * @swagger
 * /api/v0/inventory/{inventory}/value/subsector/{subsector}:
 *   delete:
 *     tags:
 *       - Inventory Values
 *     summary: Delete inventory value for a subsector
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: subsector
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inventory value deleted.
 *       404:
 *         description: Inventory value not found.
 */

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const { resource } = await PermissionService.canEditInventory(
    session,
    params.inventory,
  );

  const inventory = resource as Inventory;

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
