import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { GasToCO2Eq } from "@/models/GasToCO2Eq";
import type { InventoryValue } from "@/models/InventoryValue";
import { multiplyBigIntFloat } from "@/util/big_int";
import createHttpError from "http-errors";
import { findMethodology, MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";

export type Gas = {
  gas: string;
  amount: bigint;
};

export type FormulaResult = {
  gases: Gas[];
  totalCO2e: bigint;
  totalCO2eYears: number;
};

const GAS_NAMES = ["CO2", "N2O", "CH4"];
const DEFAULT_CO2EQ_YEARS = 100;
const METHANE_CORRECTION_FACTORS: Record<string, number> = {
  managed: 1.0,
  "managed-well-semi-aerobic": 0.5,
  "managed-poorly-active-aeration": 0.4,
  "unmanaged-5m-more-deep": 0.8,
  "unmanaged-5m-less-deep": 0.4,
  uncategorized: 0.6,
};

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
  ): Promise<FormulaResult> {
    const formula = await CalculationService.getFormula(inputMethodology);

    // TODO cache
    const gasToCO2Eqs = await db.models.GasToCO2Eq.findAll();
    let totalCO2e = 0n;
    let totalCO2eYears = 0;
    let gases: { gas: string; amount: bigint }[] = [];
    let result: FormulaResult | null = null;

    switch (formula) {
      // TODO use Record<string, (activityValue, gasToCO2Eqs) => FormulaResult> for this? To avoid adding new code here for each new formula...
      // basically like a function pointer table in C++...
      case "direct-measure":
        result = CalculationService.handleDirectMeasureFormula(
          activityValue,
          gasToCO2Eqs,
        );
        break;
      case "activity-amount-times-emissions-factor":
        result =
          CalculationService.handleActivityAmountTimesEmissionsFactorFormula(
            activityValue,
            gasToCO2Eqs,
          );
        break;
      case "methane-commitment":
        result = CalculationService.handleMethaneCommitmentFormula(
          activityValue,
          gasToCO2Eqs,
        );
        break;
      default:
        throw new createHttpError.NotImplemented(
          `Formula ${formula} not yet implemented for input methodology ${inventoryValue.inputMethodology}`,
        );
    }

    gases = result.gases;
    totalCO2e += result.totalCO2e;
    totalCO2eYears = Math.max(result.totalCO2eYears, totalCO2eYears);

    return {
      totalCO2e,
      totalCO2eYears,
      gases,
    };
  }

  static handleMethaneCommitmentFormula(
    activityValue: ActivityValue,
    gasToCO2Eqs: GasToCO2Eq[],
  ): FormulaResult {
    const data = activityValue.activityData;
    if (!data) {
      throw new createHttpError.BadRequest(
        "Activity has no data associated, so it can't use the formula",
      );
    }
    const foodFraction = (data.foodFraction || 0) / 100.0;
    const gardenWasteFraction = (data.gardenWasteFraction || 0) / 100.0;
    const paperFraction = (data.paperFraction || 0) / 100.0;
    const woodFraction = (data.woodFraction || 0) / 100.0;
    const textilesFraction = (data.textilesFraction || 0) / 100.0;
    const industrialWasteFraction = (data.industrialWasteFraction || 0) / 100.0;

    const landfillType = data["landfill-type"];
    const recoveredMethaneFraction = data.recoveredMethaneFraction || 0;
    const oxidationFactor = data.landfillType;
    const totalSolidWaste = data.solidWaste || 0; // TODO is this MSW_x??

    // Degradable organic carbon in year of deposition, fraction (tonnes C/tonnes waste)
    const degradableOrganicCarbon =
      0.15 * foodFraction +
      0.2 * gardenWasteFraction +
      0.4 * paperFraction +
      0.43 * woodFraction +
      0.24 * textilesFraction +
      0.15 * industrialWasteFraction;

    const methaneCorrectionFactor = METHANE_CORRECTION_FACTORS[landfillType];
    const DOC_FRACTION = 0.6; // GPC assumption
    const METHANE_FRACTION = 0.5; // GPC assumption
    const L_O =
      methaneCorrectionFactor *
      degradableOrganicCarbon *
      DOC_FRACTION *
      METHANE_FRACTION *
      (16 / 12.0);

    const ch4Emissions =
      totalSolidWaste *
      L_O *
      (1 - recoveredMethaneFraction) *
      (1 - oxidationFactor);

    const ch4CO2e = gasToCO2Eqs.find((g) => g.gas === "CH4");
    const co2eFactor = ch4CO2e?.co2eqPerKg ?? 0;
    return {
      // TODO perform above calculation using BigInt/ BigNumber?
      totalCO2e: BigInt(ch4Emissions * co2eFactor),
      totalCO2eYears: ch4CO2e?.co2eqYears ?? DEFAULT_CO2EQ_YEARS,
      gases: [
        {
          gas: "CH4",
          amount: BigInt(ch4Emissions),
        },
      ],
    };
  }

  private static handleActivityAmountTimesEmissionsFactorFormula(
    activityValue: ActivityValue,
    gasToCO2Eqs: GasToCO2Eq[],
  ): FormulaResult {
    let totalCO2e = 0n;
    let totalCO2eYears = 0;
    // TODO add actvityAmount column to ActivityValue
    // const activityAmount = activityValue.activityAmount || 0;
    const data = activityValue.activityData;
    const activityAmount = data ? data["activity_amount"] || 0 : 0;
    const gases = activityValue.gasValues.map((gasValue) => {
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

    return { gases, totalCO2e, totalCO2eYears };
  }

  private static handleDirectMeasureFormula(
    activityValue: ActivityValue,
    gasToCO2Eqs: GasToCO2Eq[],
  ): FormulaResult {
    const result = { gases: [] as Gas[], totalCO2e: 0n, totalCO2eYears: 0 };
    result.gases = GAS_NAMES.map((gasName) => {
      const data = activityValue.activityData;
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
      result.totalCO2e += co2eq;
      result.totalCO2eYears = Math.max(result.totalCO2eYears, co2eqYears);
      return { gas: gasName, amount: amount };
    });
    return result;
  }
}
