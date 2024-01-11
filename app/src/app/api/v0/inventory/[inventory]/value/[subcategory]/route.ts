import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createInventoryValue } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const inventoryValue = await db.models.InventoryValue.findOne({
    where: { subCategoryId: params.subcategory, inventoryId: params.inventory },
  });

  if (!inventoryValue) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  return NextResponse.json({ data: inventoryValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createInventoryValue.parse(await req.json());
  let inventoryValue = await db.models.InventoryValue.findOne({
    where: { subCategoryId: params.subcategory, inventoryId: params.inventory },
    include: [{ model: db.models.DataSource, as: "dataSource" }],
  });
  const gasValuesData = body.gasValues;
  delete body.gasValues;
  const sourceData = body.dataSource;
  delete body.dataSource;

  const newDataSource = {
    ...sourceData,
    sourceType: "user",
    datasourceId: randomUUID(),
  };

  const subCategory = await db.models.SubCategory.findOne({
    where: { subcategoryId: params.subcategory },
    include: [{ model: db.models.SubSector, as: "subsector" }],
  });
  if (!subCategory) {
    throw new createHttpError.NotFound(
      "Sub category not found: " + params.subcategory,
    );
  }

  if (inventoryValue) {
    // update or replace data source if necessary
    let datasourceId: string | undefined = undefined;
    if (inventoryValue.datasourceId) {
      if (inventoryValue.dataSource.sourceType === "user") {
        if (sourceData) {
          await inventoryValue.dataSource.update(sourceData);
        }
        datasourceId = inventoryValue.datasourceId;
      } else {
        const source = await db.models.DataSource.create(newDataSource);
        datasourceId = source.datasourceId;
      }
    } else {
      const source = await db.models.DataSource.create(newDataSource);
      datasourceId = source.datasourceId;
    }

    inventoryValue = await inventoryValue.update({
      ...body,
      id: inventoryValue.id,
      datasourceId,
    });
  } else {
    const source = await db.models.DataSource.create(newDataSource);

    inventoryValue = await db.models.InventoryValue.create({
      ...body,
      id: randomUUID(),
      subCategoryId: params.subcategory,
      subSectorId: subCategory.subsectorId,
      sectorId: subCategory.subsector.sectorId,
      inventoryId: params.inventory,
      datasourceId: source.datasourceId,
    });
  }

  const gasValues = await db.models.GasValue.findAll({
    where: { inventoryValueId: inventoryValue.id },
    include: { model: db.models.EmissionsFactor, as: "emissionsFactor" },
  });
  // only update gas values when data is passed
  if (gasValuesData) {
    for (const gasValue of gasValues) {
      // remove deleted values or update
      const gasData = gasValuesData.find((data) => data.gas === gasValue.gas);
      if (!gasData) {
        await gasValue.destroy();
      } else {
        // create user emissions factors if necessary
        let emissionsFactorId = gasData.emissionsFactorId;
        const emissionsFactorData = gasData.emissionsFactor;
        delete gasData.emissionsFactor;
        if (emissionsFactorData) {
          // has existing emissions factor with inventoryId (= defined by user)?
          if (gasValue.emissionsFactor?.inventoryId) {
            gasValue.emissionsFactor.update(emissionsFactorData);
            emissionsFactorId = gasValue.emissionsFactorId;
          } else {
            const emissionsFactor = await db.models.EmissionsFactor.create({
              ...emissionsFactorData,
              id: randomUUID(),
              inventoryId: params.inventory,
            });
            emissionsFactorId = emissionsFactor.id;
          }
        }
        await gasValue.update({ ...gasData, emissionsFactorId });
      }
    }

    // create new gas values if necessary
    for (const gasData of gasValuesData) {
      const value = gasValues.find((value) => value.gas === gasData.gas);
      if (!value) {
        // create user emissions factors if necessary
        let emissionsFactorId = gasData.emissionsFactorId;
        const emissionsFactorData = gasData.emissionsFactor;
        delete gasData.emissionsFactor;
        if (emissionsFactorData) {
          const emissionsFactor = await db.models.EmissionsFactor.create({
            ...emissionsFactorData,
            id: randomUUID(),
            inventoryId: params.inventory,
          });
          emissionsFactorId = emissionsFactor.id;
        }

        await db.models.GasValue.create({
          ...gasData,
          id: randomUUID(),
          inventoryValueId: inventoryValue.id,
          emissionsFactorId,
        });
      }
    }
  }

  return NextResponse.json({ data: inventoryValue });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }) => {
  const subcategoryValue = await db.models.InventoryValue.findOne({
    where: { subCategoryId: params.subcategory, inventoryId: params.inventory },
  });
  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  await subcategoryValue.destroy();

  return NextResponse.json({ data: subcategoryValue, deleted: true });
});
