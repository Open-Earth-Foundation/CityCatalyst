import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { GasToCO2Eq } from "@/models/GasToCO2Eq";
import type { InventoryValue } from "@/models/InventoryValue";
import createHttpError from "http-errors";
import { findMethodology } from "@/util/form-schema";
import {
  handleActivityAmountTimesEmissionsFactorFormula,
  handleBiologicalTreatmentFormula,
  handleDirectMeasureFormula,
  handleDomesticWasteWaterFormula,
  handleIncinerationWasteFormula,
  handleIndustrialWasteWaterFormula,
  handleMethaneCommitmentFormula,
  handleVkt1Formula,
} from "./formulas";
import { EmissionsFactorAttributes } from "@/models/EmissionsFactor";
import { GasValueCreationAttributes } from "@/models/GasValue";
import { Decimal } from "decimal.js";

export type Gas = {
  gas: string;
  amount: Decimal;
};

export type GasAmountResult = {
  totalCO2e: Decimal;
  totalCO2eYears: number;
  gases: Gas[];
};

export type GasValue = Omit<GasValueCreationAttributes, "id"> & {
  emissionsFactor?:
    | EmissionsFactorAttributes
    | Omit<EmissionsFactorAttributes, "id">;
};

const DEFAULT_CO2EQ_YEARS = 100;

export default class CalculationService {
  private static calculateCO2eq(
    gasToCO2Eqs: GasToCO2Eq[],
    gasName: string,
    amount: Decimal,
  ): { co2eq: Decimal; co2eqYears: number } {
    // TODO the rest of this could be shared for all formulas?
    const globalWarmingPotential = gasToCO2Eqs.find(
      (entry) => entry.gas === gasName,
    );
    if (!globalWarmingPotential) {
      throw new createHttpError.NotFound(
        `Could not find gas ${gasName} in GasToCO2Eq table`,
      );
    }

    const co2eq = Decimal.mul(amount, globalWarmingPotential.co2eqPerKg || 0);
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

  public static getFormulaMapping(
    inputMethodology: string,
  ): Record<string, string> {
    const methodology = findMethodology(inputMethodology);
    if (!methodology) {
      throw new createHttpError.NotFound(
        `Could not find methodology ${inputMethodology} in manual-input-hierarchy.json`,
      );
    }

    // TODO map to the right activity object based on the activity value
    return methodology.activities?.[0]?.["formula-mapping"] as Record<
      string,
      string
    >;
  }

  public static async calculateGasAmount(
    inventoryValue: InventoryValue,
    activityValue: ActivityValue,
    inputMethodology: string,
    gasValues: GasValue[],
  ): Promise<GasAmountResult> {
    const formula = await CalculationService.getFormula(inputMethodology);

    // TODO cache
    const gasToCO2Eqs = await db.models.GasToCO2Eq.findAll();
    let totalCO2e = new Decimal(0);
    let totalCO2eYears = 0;
    let gases: Gas[] = [];

    switch (formula) {
      // TODO use Record<string, (activityValue, gasToCO2Eqs) => FormulaResult> for this? To avoid adding new code here for each new formula...
      // basically like a function pointer table in C++...
      case "direct-measure":
        gases = handleDirectMeasureFormula(activityValue);
        break;
      case "activity-amount-times-emissions-factor":
        gases = handleActivityAmountTimesEmissionsFactorFormula(
          activityValue,
          gasValues,
          inventoryValue,
        );
        break;
      case "methane-commitment":
        gases = handleMethaneCommitmentFormula(activityValue, inventoryValue);
        break;
      case "incineration-waste":
        const incinerationFormulaMapping =
          CalculationService.getFormulaMapping(inputMethodology);
        gases = await handleIncinerationWasteFormula(
          activityValue,
          inventoryValue,
          incinerationFormulaMapping,
        );
        break;
      case "induced-activity-1":
        gases = handleVkt1Formula(activityValue, gasValues, inventoryValue);
        break;
      case "biological-treatment":
        let formulaMapping =
          CalculationService.getFormulaMapping(inputMethodology);
        gases = await handleBiologicalTreatmentFormula(
          activityValue,
          inventoryValue,
          formulaMapping,
        );
        break;
      case "wastewater-calculator":
        const activityId = activityValue.metadata?.activityId;

        // TODO handle outside activities as well!
        if (
          activityId === "wastewater-inside-domestic-calculator-activity" ||
          activityId === "wastewater-outside-domestic-calculator-activity"
        ) {
          let prefixKey = activityId.split("-").slice(0, -1).join("-");
          const inventory = await db.models.Inventory.findByPk(
            inventoryValue.inventoryId,
          );
          if (!inventory) {
            throw new createHttpError.NotFound("Inventory not found");
          }
          gases = await handleDomesticWasteWaterFormula(
            activityValue,
            inventory,
            inventoryValue,
            prefixKey,
          );
        } else if (
          activityId === "wastewater-inside-industrial-calculator-activity" ||
          activityId === "wastewater-outside-industrial-calculator-activity"
        ) {
          let prefixKey = activityId.split("-").slice(0, -1).join("-");
          gases = handleIndustrialWasteWaterFormula(
            activityValue,
            inventoryValue,
            prefixKey,
          );
        } else {
          throw new createHttpError.BadRequest(
            `Unknown activity ID ${activityId} for wastewater calculator formula in activity value ${activityValue.id}`,
          );
        }
        break;
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
      totalCO2e = Decimal.sum(totalCO2e, co2eq);
      totalCO2eYears = Math.max(co2eqYears, totalCO2eYears);
    }

    return {
      totalCO2e,
      totalCO2eYears,
      gases,
    };
  }
}
