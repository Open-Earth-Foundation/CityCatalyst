import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { InventoryValue } from "@/models/InventoryValue";
import { logger } from "@/services/logger";
import { multiplyBigIntFloat } from "@/util/big_int";
import createHttpError from "http-errors";

export type GasAmountResult = {
  totalCO2e: bigint;
  gases: { gas: string; amount: bigint }[];
};

const GAS_NAMES = ["CO2", "N2O", "CH4"];

export default class CalculationService {
  public static async calculateGasAmount(
    inventoryValue: InventoryValue,
    activityValue: ActivityValue,
    formula: string,
  ): Promise<GasAmountResult> {
    // TODO cache
    const gasToCO2Eqs = await db.models.GasToCO2Eq.findAll();
    let totalCO2e = 0n;
    let gases: { gas: string; amount: bigint }[] = [];

    switch (formula) {
      case "direct-measure":
        gases = GAS_NAMES.map((gasName) => {
          const data = activityValue.activityData as Record<string, any>;
          const key = gasName.toLowerCase() + "_amount";
          if (!data || !data[key]) {
            throw new createHttpError.BadRequest(
              "Missing direct measure form entry " + key,
            );
          }
          // TODO save amount to GasValue entry?
          const amount = BigInt(data[key]);

          // TODO the rest of this could be shared for all formulas?
          const globalWarmingPotential = gasToCO2Eqs.find(
            (entry) => entry.gas === gasName,
          );
          if (!globalWarmingPotential) {
            throw new createHttpError.NotFound(
              `Could not find gas ${gasName} in GasToCO2Eq table`,
            );
          }

          const co2eq = multiplyBigIntFloat(
            amount,
            globalWarmingPotential.co2eqPerKg || 0,
          );
          totalCO2e += co2eq;
          return { gas: gasName, amount };
        });
        break;
      default:
        throw new createHttpError.NotImplemented(
          `Formula ${formula} not yet implemented for input methodology ${inventoryValue.inputMethodology}`,
        );
    }
    return {
      totalCO2e,
      gases,
    };
  }
}
