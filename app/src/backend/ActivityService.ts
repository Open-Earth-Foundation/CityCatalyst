import CalculationService from "@/backend/CalculationService";
import GPCService from "@/backend/GPCService";
import { db } from "@/models";
import type {
  ActivityValue,
  ActivityValueAttributes,
  ActivityValueCreationAttributes,
} from "@/models/ActivityValue";
import type { DataSourceAttributes } from "@/models/DataSource";
import type {
  EmissionsFactor,
  EmissionsFactorAttributes,
  EmissionsFactorCreationAttributes,
} from "@/models/EmissionsFactor";
import type { GasValueCreationAttributes } from "@/models/GasValue";
import type {
  InventoryValue,
  InventoryValueAttributes,
} from "@/models/InventoryValue";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import type { Transaction } from "sequelize";

type GasValueInput = Omit<GasValueCreationAttributes, "id"> & {
  emissionsFactor?: Omit<EmissionsFactorAttributes, "id">;
};

export default class ActivityService {
  public static async createActivity(
    activityValueParams: Omit<ActivityValueAttributes, "id">,
    inventoryId: string,
    inventoryValueId: string | undefined,
    inventoryValueParams: Omit<InventoryValueAttributes, "id"> | undefined,
    gasValues: GasValueInput[] | undefined,
    dataSourceParams: Omit<DataSourceAttributes, "datasourceId"> | undefined,
  ): Promise<ActivityValue | undefined> {
    const result = await db.sequelize?.transaction(
      async (transaction: Transaction): Promise<ActivityValue> => {
        const dataSource = await db.models.DataSource.create(
          {
            ...dataSourceParams,
            datasourceId: randomUUID(),
          },
          { transaction },
        );
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

          // create inventory value if there isn't one yet
          inventoryValue = await db.models.InventoryValue.create({
            ...inventoryValueParams,
            id: randomUUID(),
            inventoryId,
            sectorId,
            subSectorId,
            subCategoryId,
          });
        } else if (inventoryValueId) {
          inventoryValue =
            await db.models.InventoryValue.findByPk(inventoryValueId);
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
        await inventoryValue.save({ transaction });
        activityValue.co2eq = totalCO2e;
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

    return result;
  }
}
