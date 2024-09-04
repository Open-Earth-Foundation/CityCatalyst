import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { GasToCO2Eq } from "@/models/GasToCO2Eq";
import type { InventoryValue } from "@/models/InventoryValue";
import { multiplyBigIntFloat } from "@/util/big_int";
import createHttpError from "http-errors";
import { findMethodology } from "@/util/form-schema";
import {
  handleActivityAmountTimesEmissionsFactorFormula,
  handleDirectMeasureFormula,
  handleMethaneCommitmentFormula,
  handleVkt1Formula,
} from "./formulas";

export type Gas = {
  gas: string;
  amount: bigint;
};

export type GasAmountResult = {
  totalCO2e: bigint;
  totalCO2eYears: number;
  gases: Gas[];
};

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

    let formula = "activity-amount-times-emissions-factor"; // fallback value

    // search manual-input-hierarchy.json for inputMethodology ID
    // TODO pass refNo from request into this function for faster search
    const methodology = findMethodology(inputMethodology);
    if (!methodology) {
      throw new createHttpError.NotFound(
        `Could not find methodology ${inputMethodology} in manual-input-hierarchy.json`,
      );
    }
    return methodology.formula ?? formula;
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
    let gases: Gas[] = [];

    switch (formula) {
      // TODO use Record<string, (activityValue, gasToCO2Eqs) => FormulaResult> for this? To avoid adding new code here for each new formula...
      // basically like a function pointer table in C++...
      case "direct-measure":
        gases = handleDirectMeasureFormula(activityValue);
        break;
      case "activity-amount-times-emissions-factor":
        gases = handleActivityAmountTimesEmissionsFactorFormula(activityValue);
        break;
      case "methane-commitment":
        gases = handleMethaneCommitmentFormula(activityValue);
        break;
      case "induced-activity-1":
        gases = handleVkt1Formula(activityValue);
      default:
        throw new createHttpError.NotImplemented(
          `Formula ${formula} not yet implemented for input methodology ${inventoryValue.inputMethodology}`,
        );
    }

    for (const gas of gases) {
      const { co2eq, co2eqYears } = this.calculateCO2eq(
        gasToCO2Eqs,
        gas.gas,
        gas.amount,
      );
      totalCO2e += co2eq;
      totalCO2eYears = Math.max(co2eqYears, totalCO2eYears);
    }

    return {
      totalCO2e,
      totalCO2eYears,
      gases,
    };
  }
}
