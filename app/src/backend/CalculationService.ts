import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { GasToCO2Eq } from "@/models/GasToCO2Eq";
import type { InventoryValue } from "@/models/InventoryValue";
import { multiplyBigIntFloat } from "@/util/big_int";
import createHttpError from "http-errors";

export type GasAmountResult = {
  totalCO2e: bigint;
  totalCO2eYears: number;
  gases: { gas: string; amount: bigint }[];
};

const GAS_NAMES = ["CO2", "N2O", "CH4"];
const DEFAULT_CO2EQ_YEARS = 100;

export default class CalculationService {
  private static calculateCO2eq(
    gasToCO2Eqs: GasToCO2Eq[],
    gasName: string,
    amount: bigint,
  ): { co2eq: bigint; co2eqYears: number } {
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
    const co2eqYears = globalWarmingPotential.co2eqYears || DEFAULT_CO2EQ_YEARS;
    return { co2eq, co2eqYears };
  }

  public static async getFormula(inputMethodology: string): Promise<string> {
    if (inputMethodology === "direct-measure") {
      return "direct-measure";
    }

    const formula = "unknown";
    // TODO load JSON schema file
    // TODO search for inputMethodology ID
    return formula;
  }

  public static async calculateGasAmount(
    inventoryValue: InventoryValue,
    activityValue: ActivityValue,
    inputMethodology: string,
  ): Promise<GasAmountResult> {
    const formula = await CalculationService.getFormula(inputMethodology);

    // TODO cache
    const gasToCO2Eqs = await db.models.GasToCO2Eq.findAll();
    let totalCO2e = 0n;
    let totalCO2eYears = 0;
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
          const { co2eq, co2eqYears } = this.calculateCO2eq(
            gasToCO2Eqs,
            gasName,
            amount,
          );
          totalCO2e += co2eq;
          totalCO2eYears = Math.max(totalCO2eYears, co2eqYears);
          return { gas: gasName, amount: amount };
        });
        break;
      case "activity-amount-times-emissions-factor":
        console.log(formula)
        // TODO add actvityAmount column to ActivityValue
        // const activityAmount = activityValue.activityAmount || 0;
        const activityAmount = activityValue.activityData
          ? activityValue.activityData["activity_amount"] || 0
          : 0;
        gases = activityValue.gasValues.map((gasValue) => {
          const emissionsFactor = gasValue.emissionsFactor;
          if (emissionsFactor == null) {
            throw new createHttpError.BadRequest(
              "Missing emissions factor for activity",
            );
          }
          if (emissionsFactor.emissionsPerActivity == null) {
            throw new createHttpError.BadRequest(
              `Emissions factor ${emissionsFactor.id} has no emissions per activity`,
            );
          }
          // this rounds/ truncates!
          const amount = BigInt(
            activityAmount * emissionsFactor.emissionsPerActivity,
          );
          const { co2eq, co2eqYears } = this.calculateCO2eq(
            gasToCO2Eqs,
            gasValue.gas!,
            amount,
          );
          totalCO2e += co2eq;
          totalCO2eYears = Math.max(totalCO2eYears, co2eqYears);

          return { gas: gasValue.gas!, amount };
        });
        break;
      default:
        throw new createHttpError.NotImplemented(
          `Formula ${formula} not yet implemented for input methodology ${inventoryValue.inputMethodology}`,
        );
    }
    return {
      totalCO2e,
      totalCO2eYears,
      gases,
    };
  }
}
