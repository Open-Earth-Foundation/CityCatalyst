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
    let gases: Gas[] = [];

    switch (formula) {
      // TODO use Record<string, (activityValue, gasToCO2Eqs) => FormulaResult> for this? To avoid adding new code here for each new formula...
      // basically like a function pointer table in C++...
      case "direct-measure":
        gases = CalculationService.handleDirectMeasureFormula(
          activityValue,
          gasToCO2Eqs,
        );
        break;
      case "activity-amount-times-emissions-factor":
        gases =
          CalculationService.handleActivityAmountTimesEmissionsFactorFormula(
            activityValue,
            gasToCO2Eqs,
          );
        break;
      case "methane-commitment":
        gases = CalculationService.handleMethaneCommitmentFormula(
          activityValue,
          gasToCO2Eqs,
        );
        break;
      case "induced-activity-1": // TODO or VKT-1? What is it in the hierarchy.json file?
        gases = CalculationService.handleVkt1Formula(
          activityValue,
          gasToCO2Eqs,
        );
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

  static handleVkt1Formula(
    activityValue: ActivityValue,
    gasToCO2Eqs: GasToCO2Eq[],
  ): Gas[] {
    const data = activityValue.activityData;
    if (!data) {
      throw new createHttpError.BadRequest(
        "Activity has no data associated, so it can't use the formula",
      );
    }

    const gases = activityValue.gasValues.map((gasValue) => {
      if (!gasValue.gas) {
        throw new createHttpError.BadRequest(
          "Activity has a GasValue with no `gas` name",
        );
      }
      const emissionsFactor = gasValue.emissionsFactor;
      const emissions =
        data["activity-value"] *
        data["intensity"] *
        (emissionsFactor.emissionsPerActivity ?? 0); // TODO throw BadRequest error if no EF present?
      return { gas: gasValue.gas, amount: BigInt(emissions) };
    });

    return gases;
  }

  static handleMethaneCommitmentFormula(
    activityValue: ActivityValue,
    gasToCO2Eqs: GasToCO2Eq[],
  ): Gas[] {
    const data = activityValue.activityData;
    if (!data) {
      throw new createHttpError.BadRequest(
        "Activity has no data associated, so it can't use the formula",
      );
    }
    const foodFraction = (data["food-fraction"] || 0) / 100.0;
    const gardenWasteFraction = (data["garden-waste-fraction"] || 0) / 100.0;
    const paperFraction = (data["paper-fraction"] || 0) / 100.0;
    const woodFraction = (data["wood-fraction"] || 0) / 100.0;
    const textilesFraction = (data["textiles-fraction"] || 0) / 100.0;
    const industrialWasteFraction =
      (data["industrial-waste-fraction"] || 0) / 100.0;

    const landfillType = data["landfill-type"];
    // Rewrite the property accesses in data here to use kebab-case instead of camelCase.

    const recoveredMethaneFraction = data["recovered-methane-fraction"] || 0;
    const oxidationFactor = data["landfill-type"].startsWith("managed-well")
      ? 0.1
      : 0;
    const totalSolidWaste = data["total-solid-waste"] || 0;

    // Degradable organic carbon in year of deposition, fraction (tonnes C/tonnes waste)
    const degradableOrganicCarbon =
      0.15 * foodFraction +
      0.2 * gardenWasteFraction +
      0.4 * paperFraction +
      0.43 * woodFraction +
      0.24 * textilesFraction +
      0.15 * industrialWasteFraction;

    const methaneCorrectionFactor = METHANE_CORRECTION_FACTORS[landfillType];
    // GPC assumption, Fraction of degradable organic carbon that is ultimately degraded
    const DOC_FRACTION = 0.6;
    // GPC assumption, fraction of methane in landfill gas
    const METHANE_FRACTION = 0.5;
    const methaneGenerationPotential =
      methaneCorrectionFactor *
      degradableOrganicCarbon *
      DOC_FRACTION *
      METHANE_FRACTION *
      (16 / 12.0);

    const ch4Emissions =
      totalSolidWaste *
      methaneGenerationPotential *
      (1 - recoveredMethaneFraction) *
      (1 - oxidationFactor);

    return [{ gas: "CH4", amount: BigInt(ch4Emissions) }];
  }

  private static handleActivityAmountTimesEmissionsFactorFormula(
    activityValue: ActivityValue,
    gasToCO2Eqs: GasToCO2Eq[],
  ): Gas[] {
    let totalCO2e = 0n;
    let totalCO2eYears = 0;
    // TODO add actvityAmount column to ActivityValue
    // const activityAmount = activityValue.activityAmount || 0;
    // TODO perform these calculations using BigInt/ BigNumber?
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

      return { gas: gasValue.gas!, amount };
    });

    return gases;
  }

  private static handleDirectMeasureFormula(
    activityValue: ActivityValue,
    gasToCO2Eqs: GasToCO2Eq[],
  ): Gas[] {
    const gases = GAS_NAMES.map((gasName) => {
      const data = activityValue.activityData;
      const key = gasName.toLowerCase() + "_amount";
      if (!data || !data[key]) {
        throw new createHttpError.BadRequest(
          "Missing direct measure form entry " + key,
        );
      }
      // TODO save amount to GasValue entry?
      const amount = BigInt(data[key]);
      return { gas: gasName, amount: amount };
    });
    return gases;
  }
}
