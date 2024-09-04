import type { ActivityValue } from "@/models/ActivityValue";
import type { Gas } from "./CalculationService";
import createHttpError from "http-errors";

const GAS_NAMES = ["CO2", "N2O", "CH4"];
const METHANE_CORRECTION_FACTORS: Record<string, number> = {
  managed: 1.0,
  "managed-well-semi-aerobic": 0.5,
  "managed-poorly-active-aeration": 0.4,
  "unmanaged-5m-more-deep": 0.8,
  "unmanaged-5m-less-deep": 0.4,
  uncategorized: 0.6,
};

export function handleVkt1Formula(activityValue: ActivityValue): Gas[] {
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
    if (emissionsFactor?.emissionsPerActivity == null) {
      throw new createHttpError.BadRequest(
        `Emissions factor ${emissionsFactor.id} has no emissions per activity`,
      );
    }
    const emissions =
      data["activity-value"] *
      data["intensity"] *
      emissionsFactor.emissionsPerActivity;
    return { gas: gasValue.gas, amount: BigInt(emissions) };
  });

  return gases;
}

export function handleMethaneCommitmentFormula(
  activityValue: ActivityValue,
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

export function handleActivityAmountTimesEmissionsFactorFormula(
  activityValue: ActivityValue,
): Gas[] {
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

export function handleDirectMeasureFormula(
  activityValue: ActivityValue,
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
