import CalculationService from "@/backend/CalculationService";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { EmissionsFactor } from "@/models/EmissionsFactor";
import type { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { Op, type WhereOptions } from "sequelize";
import { z } from "zod";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = createActivityValueRequest.parse(await req.json());
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await db.sequelize?.transaction(
    async (transaction): Promise<ActivityValue> => {
      const gasValues = body.gasValues;
      delete body.gasValues;
      const dataSourceParams = body.dataSource;
      delete body.dataSource;

      const dataSource = await db.models.DataSource.create(
        {
          ...dataSourceParams,
          datasourceId: randomUUID(),
        },
        { transaction },
      );
      let inventoryValueId: string | undefined = body.inventoryValueId;
      if (!inventoryValueId) {
        // TODO create inventory value here
        throw new createHttpError.NotImplemented(
          "Creating InventoryValue from ActivityValue not yet implemented, so inventoryValueId is required currently",
        );
      }
      const inventoryValue =
        await db.models.InventoryValue.findByPk(inventoryValueId);
      if (!inventoryValue) {
        throw new createHttpError.NotFound("InventoryValue not found");
      }
      if (!inventoryValue.inputMethodology) {
        throw new createHttpError.BadRequest(
          `Inventory value ${inventoryValue.id} is missing an input methodology`,
        );
      }

      const activityValue = await db.models.ActivityValue.create(
        {
          ...body,
          datasourceId: dataSource.datasourceId,
          inventoryValueId,
          id: randomUUID(),
        },
        { transaction },
      );

      let { totalCO2e, totalCO2eYears, gases } =
        await CalculationService.calculateGasAmount(
          inventoryValue,
          activityValue,
          inventoryValue.inputMethodology,
        );

      // TODO for PATCH version of this, subtract previous value first
      inventoryValue.co2eq = (inventoryValue.co2eq ?? 0n) + totalCO2e;
      inventoryValue.co2eqYears = Math.max(
        inventoryValue.co2eqYears ?? 0,
        totalCO2eYears,
      );
      activityValue.co2eq = totalCO2e;
      activityValue.co2eqYears = totalCO2eYears;

      if (gasValues) {
        for (const gasValue of gasValues) {
          let emissionsFactor: EmissionsFactor | null = null;

          // update emissions factor if already assigned and from this inventory
          if (
            gasValue.emissionsFactorId == null &&
            gasValue.emissionsFactor != null
          ) {
            emissionsFactor = await db.models.EmissionsFactor.create(
              {
                ...gasValue.emissionsFactor,
                id: randomUUID(),
                inventoryId: params.inventory,
              },
              { transaction },
            );
          }

          if (gasValue.emissionsFactor && !emissionsFactor) {
            throw new createHttpError.InternalServerError(
              "Failed to create an emissions factor",
            );
          }

          delete gasValue.emissionsFactor;

          if (gasValue.gasAmount == null) {
            gasValue.gasAmount =
              gases.find((gas) => gas.gas === gasValue.gas)?.amount ?? 0n;
          }

          await db.models.GasValue.upsert(
            {
              ...gasValue,
              id: gasValue.id ?? randomUUID(),
              activityValueId: activityValue.id,
              inventoryValueId: activityValue?.inventoryValueId,
            },
            { transaction },
          );
        }
      }

      return activityValue;
    },
  );

  return NextResponse.json({ success: result != null, data: result });
});

export const GET = apiHandler(async (req, { params, session }) => {
  // extract and validate query params
  const subCategoryIdsParam = req.nextUrl.searchParams.get("subCategoryIds");
  const subSectorId = req.nextUrl.searchParams.get("subSectorId");

  let subCategoryIds;
  if (subCategoryIdsParam && subCategoryIdsParam.length > 0) {
    subCategoryIds = subCategoryIdsParam.split(",");
  } else if (subSectorId && subSectorId.length > 0) {
    const subCategories = await db.models.SubCategory.findAll({
      where: { subsectorId: subSectorId! },
    });
    subCategoryIds = subCategories.map((sc) => sc.subcategoryId);
  } else {
    throw new createHttpError.BadRequest(
      "Query parameter subCategoryIds or subSectorId is required!",
    );
  }

  // optional filter for a specific methodology
  const methodologyId = req.nextUrl.searchParams.get("methodologyId");
  if (methodologyId) {
    z.string().uuid().parse(methodologyId);
  }

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  const query: WhereOptions<InventoryValue> = {
    subCategoryId: { [Op.in]: subCategoryIds },
    inventoryId: inventory.inventoryId,
  };
  if (methodologyId) {
    query.inputMethodology = methodologyId;
  }
  const activityValues = await db.models.ActivityValue.findAll({
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: query,
      },
      { model: db.models.DataSource, as: "dataSource" },
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
  });

  if (!activityValues) {
    throw new createHttpError.NotFound("Activity values not found");
  }

  return NextResponse.json({ data: activityValues });
});
