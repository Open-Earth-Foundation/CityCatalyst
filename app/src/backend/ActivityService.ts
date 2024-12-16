import CalculationService, { Gas } from "@/backend/CalculationService";
import GPCService from "@/backend/GPCService";
import { db } from "@/models";
import type {
  ActivityValue,
  ActivityValueAttributes,
} from "@/models/ActivityValue";
import type {
  EmissionsFactor,
  EmissionsFactorAttributes,
} from "@/models/EmissionsFactor";
import type { GasValueCreationAttributes } from "@/models/GasValue";
import type {
  InventoryValue,
  InventoryValueAttributes,
} from "@/models/InventoryValue";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import type { Transaction } from "sequelize";
import ManualInputValidationService from "./ManualnputValidationService";
import { decimalToBigInt } from "@/util/big_int";

type GasValueInput = Omit<GasValueCreationAttributes, "id"> & {
  emissionsFactor?: Omit<EmissionsFactorAttributes, "id">;
};

export type UpdateGasValueInput = GasValueCreationAttributes & {
  emissionsFactor?: EmissionsFactorAttributes;
};

export default class ActivityService {
  private static async updateInventoryValue({
    activityValue,
    inventoryValueParams,
    transaction,
  }: {
    activityValue: ActivityValue;
    inventoryValueParams?: Omit<InventoryValueAttributes, "id"> | undefined;
    transaction: Transaction;
  }) {
    let inventoryValueId = activityValue.inventoryValueId;

    let inventoryValue = await db.models.InventoryValue.findByPk(
      inventoryValueId,
      { transaction },
    );

    if (!inventoryValue) {
      throw new createHttpError.NotFound(
        `Inventory value with ID ${inventoryValueId} not found`,
      );
    }

    // always make sure an input methodology exists
    if (
      !(
        inventoryValue.inputMethodology ||
        inventoryValueParams?.inputMethodology
      )
    ) {
      throw new createHttpError.NotFound(
        `Inventory value ${inventoryValue.id} is missing an input methodology`,
      );
    }

    // if inventoryValueParams exist update the inventoryValues
    if (inventoryValueParams) {
      await inventoryValue.update({
        id: inventoryValueId as string,
        ...inventoryValueParams,
      });
    }

    return await inventoryValue.reload();
  }

  private static async updateGasValues({
    gasValues,
    activityValue,
    transaction,
    gases,
  }: {
    gasValues: UpdateGasValueInput[];
    activityValue: ActivityValue;
    transaction: Transaction;
    gases: Gas[];
  }) {
    for (const gasValue of gasValues) {
      let emissionsFactor: EmissionsFactor | null = null;

      // find the emissions factor with the gas emissions Factor id
      emissionsFactor = await db.models.EmissionsFactor.findByPk(
        gasValue.emissionsFactorId,
        { transaction },
      );

      if (!emissionsFactor) {
        throw new createHttpError.InternalServerError(
          "EmissionsFactor not found",
        );
      }

      // Update the EmissionsFactor if needed
      if (gasValue.emissionsFactor) {
        await emissionsFactor.update(gasValue.emissionsFactor, { transaction });
      }

      delete gasValue.emissionsFactor;

      if (gasValue.gasAmount == null) {
        gasValue.gasAmount = BigInt(
          gases.find((gas) => gas.gas === gasValue.gas)?.amount?.toNumber() ??
            0,
        );
      }

      await db.models.GasValue.upsert(
        {
          emissionsFactorId: emissionsFactor.id,
          ...gasValue,
          id: gasValue.id,
          activityValueId: activityValue.id,
          inventoryValueId: activityValue?.inventoryValueId,
        },
        { transaction },
      );
    }
  }

  public static async updateActivity({
    id,
    inventoryValueId,
    inventoryValueParams,
    activityValueParams,
    gasValues,
  }: {
    id: string;
    activityValueParams: Omit<ActivityValueAttributes, "id">;
    inventoryValueId: string | undefined;
    inventoryValueParams: Omit<InventoryValueAttributes, "id"> | undefined;
    gasValues: UpdateGasValueInput[] | undefined;
  }): Promise<ActivityValue | undefined> {
    const activityValue = await db.models.ActivityValue.findOne({
      where: { id },
    });

    if (!activityValue) {
      throw new createHttpError.NotFound(
        `Activity value with ID ${id} not found`,
      );
    }

    let datasourceId = activityValue.datasourceId;

    // validate using the ManualInputValidationService
    await ManualInputValidationService.validateActivity({
      activityValueParams: activityValueParams,
      inventoryValueId,
      activityValueId: activityValue.id,
    });

    return await db.sequelize?.transaction(
      async (transaction: Transaction): Promise<ActivityValue> => {
        const inventoryValue = await this.updateInventoryValue({
          activityValue,
          inventoryValueParams,
          transaction,
        });

        // update the activity value with new params
        const updatedActivityValue = await activityValue.update(
          {
            ...activityValueParams,
            datasourceId,
            inventoryValueId,
          },
          { transaction },
        );

        let { totalCO2e, totalCO2eYears, gases } =
          await CalculationService.calculateGasAmount(
            inventoryValue,
            activityValue,
            inventoryValue.inputMethodology as string,
            gasValues as GasValueInput[],
          );

        const currentCO2e =
          BigInt(inventoryValue.co2eq as bigint) -
            BigInt(activityValue.co2eq as bigint) ?? 0n;

        const calculatedCO2e = decimalToBigInt(totalCO2e); // Ensure totalCO2e is BigInt

        inventoryValue.co2eq = currentCO2e + calculatedCO2e;
        inventoryValue.co2eqYears = Math.max(
          inventoryValue.co2eqYears ?? 0,
          totalCO2eYears,
        );

        await inventoryValue.save({ transaction });
        activityValue.co2eq = calculatedCO2e;
        activityValue.co2eqYears = totalCO2eYears;
        await activityValue.save({ transaction });

        if (gasValues) {
          await this.updateGasValues({
            gasValues,
            activityValue: updatedActivityValue,
            gases,
            transaction,
          });
        }
        return updatedActivityValue;
      },
    );
  }

  public static async createActivity(
    activityValueParams: Omit<ActivityValueAttributes, "id">,
    inventoryId: string,
    inventoryValueId: string | undefined,
    inventoryValueParams: Omit<InventoryValueAttributes, "id"> | undefined,
    gasValues: GasValueInput[] | undefined,
  ): Promise<ActivityValue | undefined> {
    // validate using the ManualInputValidationService
    await ManualInputValidationService.validateActivity({
      activityValueParams,
      inventoryValueId,
    });

    // check if there is an existing InventoryValue for the reference number
    if (!inventoryValueId && !inventoryValueParams) {
      throw new createHttpError.BadRequest(
        "Either inventoryValueId or inventory must be provided",
      );
    }
    if (inventoryValueParams) {
      const existingInventoryValue = await db.models.InventoryValue.findOne({
        where: {
          gpcReferenceNumber: inventoryValueParams?.gpcReferenceNumber,
          inventoryId,
        },
      });
      if (existingInventoryValue) {
        throw new createHttpError.BadRequest(
          `Inventory value for reference number ${existingInventoryValue.gpcReferenceNumber} already exists`,
        );
      }
    }

    return await db.sequelize?.transaction(
      async (transaction: Transaction): Promise<ActivityValue> => {
        if (inventoryValueId && inventoryValueParams) {
          throw new createHttpError.BadRequest(
            "Can't use both inventoryValueId and inventoryValue",
          );
        }

        let inventoryValue: InventoryValue | null = null;
        if (!inventoryValueId && inventoryValueParams) {
          const { sectorId, subSectorId, subCategoryId } =
            await GPCService.getIDsFromReferenceNumber(
              inventoryValueParams.gpcReferenceNumber!,
            );

          inventoryValue = await db.models.InventoryValue.create(
            {
              ...inventoryValueParams,
              id: randomUUID(),
              inventoryId,
              sectorId,
              subSectorId,
              subCategoryId: subCategoryId ?? undefined,
              gpcReferenceNumber: inventoryValueParams.gpcReferenceNumber,
            },
            { transaction },
          );
        } else if (inventoryValueId) {
          inventoryValue = await db.models.InventoryValue.findByPk(
            inventoryValueId,
            { transaction },
          );
          if (!inventoryValue) {
            throw new createHttpError.NotFound("InventoryValue not found");
          }
        } else {
          throw new createHttpError.BadRequest(
            "Either inventoryValueId or inventoryValue must be provided",
          );
        }

        if (!inventoryValue.inputMethodology) {
          throw new createHttpError.BadRequest(
            `Inventory value ${inventoryValue.id} is missing an input methodology`,
          );
        }

        const activityValue = await db.models.ActivityValue.create(
          {
            ...activityValueParams,
            inventoryValueId: inventoryValue.id,
            id: randomUUID(),
          },
          { transaction },
        );

        let { totalCO2e, totalCO2eYears, gases } =
          await CalculationService.calculateGasAmount(
            inventoryValue,
            activityValue,
            inventoryValue.inputMethodology,
            gasValues as GasValueInput[],
          );

        const currentCO2e = BigInt(inventoryValue.co2eq ?? 0n);
        const calculatedCO2e = decimalToBigInt(totalCO2e); // Ensure totalCO2e is BigInt

        inventoryValue.co2eq = currentCO2e + calculatedCO2e;
        inventoryValue.co2eqYears = Math.max(
          inventoryValue.co2eqYears ?? 0,
          totalCO2eYears,
        );

        await inventoryValue.save({ transaction });
        activityValue.co2eq = decimalToBigInt(totalCO2e);
        activityValue.co2eqYears = totalCO2eYears;
        await activityValue.save({ transaction });

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
                  inventoryId,
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
              gasValue.gasAmount = BigInt(
                gases
                  .find((gas) => gas.gas === gasValue.gas)
                  ?.amount?.toNumber()
                  .toFixed(0) ?? 0,
              );
            }

            await db.models.GasValue.create(
              {
                ...gasValue,
                id: randomUUID(),
                emissionsFactorId: emissionsFactor?.id,
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
  }

  public static async deleteActivity(id: string): Promise<void> {
    return await db.sequelize?.transaction(async (transaction) => {
      const activityValue = await db.models.ActivityValue.findByPk(id, {
        include: {
          model: db.models.InventoryValue,
          as: "inventoryValue",
          include: [
            {
              model: db.models.ActivityValue,
              as: "activityValues",
              attributes: ["id", "co2eqYears"],
            },
          ],
        },
      });

      if (!activityValue) {
        throw new createHttpError.NotFound(
          `Activity value with ID ${id} not found`,
        );
      }

      const inventoryValue = activityValue?.inventoryValue;

      const activityCount = inventoryValue?.activityValues.length;
      await activityValue.destroy({ transaction });

      // delete the InventoryValue when its last ActivityValue is deleted
      if (activityCount <= 1) {
        await inventoryValue.destroy({ transaction });
      } else {
        inventoryValue.co2eq =
          BigInt(inventoryValue.co2eq ?? 0n) -
          BigInt(activityValue.co2eq ?? 0n);

        // re-calculate co2eqYears by taking max value of remaining activity values
        let maxCo2eqYears = 0;
        for (const activityValue of inventoryValue.activityValues) {
          maxCo2eqYears = Math.max(
            maxCo2eqYears,
            activityValue.co2eqYears ?? 0,
          );
        }
        inventoryValue.co2eqYears = maxCo2eqYears;

        await inventoryValue.save({ transaction });
      }
    });
  }

  public static async deleteAllActivitiesInSubsector({
    subsectorId,
    inventoryId,
    referenceNumber,
  }: {
    subsectorId?: string;
    inventoryId: string;
    referenceNumber?: string;
  }): Promise<number> {
    const inventoryValues = await db.models.InventoryValue.findAll({
      where: {
        inventoryId,
        subSectorId: subsectorId,
      },
    });

    if (!inventoryValues) {
      throw new createHttpError.NotFound(
        "Inventory values not found for subsector",
      );
    }

    // delete all the inventory values in subsector

    return await db.models.InventoryValue.destroy({
      where: {
        inventoryId,
        ...(referenceNumber
          ? { gpcReferenceNumber: referenceNumber }
          : { subSectorId: subsectorId }),
      },
    });
  }
}
