import UserService from "@/backend/UserService";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { createInventoryValue } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

export const GET = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );
  const inventoryValue = await db.models.InventoryValue.findOne({
    where: {
      subCategoryId: params.subcategory,
      inventoryId: inventory.inventoryId,
    },
    include: [
      { model: db.models.DataSource, as: "dataSource" },
      {
        model: db.models.ActivityValue,
        as: "activityValues",
        include: [
          {
            model: db.models.GasValue,
            as: "gasValues",
            include: [
              {
                model: db.models.EmissionsFactor,
                as: "emissionsFactor",
                include: [{ model: db.models.DataSource, as: "dataSources" }],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!inventoryValue) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  return NextResponse.json({ data: inventoryValue });
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  const body = createInventoryValue.parse(await req.json());

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  let inventoryValue = await db.models.InventoryValue.findOne({
    where: {
      subCategoryId: params.subcategory,
      inventoryId: inventory.inventoryId,
    },
    include: [
      {
        model: db.models.ActivityValue,
        as: "activityValues",
        include: [{ model: db.models.GasValue, as: "gasValues" }],
      },
      { model: db.models.DataSource, as: "dataSource" },
    ],
  });
  const gasValuesData = body.gasValues;
  delete body.gasValues;

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
    inventoryValue = await inventoryValue.update({
      ...body,
      id: inventoryValue.id,
    });
  } else {
    inventoryValue = await db.models.InventoryValue.create({
      ...body,
      id: randomUUID(),
      subCategoryId: params.subcategory,
      subSectorId: subCategory.subsectorId,
      sectorId: subCategory.subsector.sectorId,
      inventoryId: params.inventory,
      gpcReferenceNumber: subCategory.referenceNumber,
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

  // calculate new co2eq value
  // load gas values again to take any modifications into account
  if (body.co2eq == null && !body.unavailableReason) {
    const newGasValues = await db.models.GasValue.findAll({
      where: { inventoryValueId: inventoryValue.id },
      include: { model: db.models.EmissionsFactor, as: "emissionsFactor" },
    });
    const gases: string[] = newGasValues
      .map((value) => value.gas!)
      .filter((value) => !!value);
    const gasesToCo2Eq =
      gases.length === 0
        ? []
        : await db.models.GasToCO2Eq.findAll({
            where: { gas: { [Op.any]: gases } },
          });
    inventoryValue.co2eqYears = gasesToCo2Eq.reduce(
      (acc, gasToCO2Eq) => Math.max(acc, gasToCO2Eq.co2eqYears || 0),
      0,
    );
    inventoryValue.co2eq = newGasValues.reduce((acc, gasValue) => {
      const hasActivityValue = inventoryValue?.activityValue != null;
      const gasToCo2Eq = gasesToCo2Eq.find(
        (entry) => entry.gas === gasValue.gas,
      );
      if (gasToCo2Eq == null) {
        logger.error(`Failed to find GasToCo2Eq entry for gas ${gasValue.gas}`);
        return acc;
      }
      if (!hasActivityValue && gasValue.gasAmount == null) {
        logger.error(
          `Neither activityValue nor GasValue.gasAmount present for InventoryValue ${inventoryValue?.id}`,
        );
        return acc;
      }
      if (hasActivityValue && gasValue.emissionsFactor == null) {
        logger.error(
          `No emissions factor present for InventoryValue ${inventoryValue?.id} and gas ${gasValue.gas}`,
        );
        return acc;
      }

      let gasAmount: bigint;
      if (hasActivityValue) {
        gasAmount = BigInt(
          Math.floor(
            inventoryValue!.activityValue! *
              gasValue.emissionsFactor.emissionsPerActivity!,
          ),
        );
      } else {
        gasAmount = BigInt(gasValue.gasAmount!);
      }

      // this assumes GWP values in the GasToCO2Eq table are always ints
      return acc + gasAmount * BigInt(gasToCo2Eq.co2eqPerKg!);
    }, 0n);
    await inventoryValue.save();
  }

  return NextResponse.json({ data: inventoryValue });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  const subcategoryValue = await db.models.InventoryValue.findOne({
    where: {
      subCategoryId: params.subcategory,
      inventoryId: inventory.inventoryId,
    },
  });
  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  await subcategoryValue.destroy();

  return NextResponse.json({ data: subcategoryValue, deleted: true });
});
