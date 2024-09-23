import createHttpError from "http-errors";

import type { ActivityValue } from "@/models/ActivityValue";
import type { Gas } from "./CalculationService";
import type { GasValueCreationAttributes } from "@/models/GasValue";
import type { EmissionsFactorAttributes } from "@/models/EmissionsFactor";

type GasValueWithEmissionsFactor = Omit<GasValueCreationAttributes, "id"> & {
  emissionsFactor?:
    | EmissionsFactorAttributes
    | Omit<EmissionsFactorAttributes, "id">;
};

const GAS_NAMES = ["CO2", "N2O", "CH4"];
const METHANE_CORRECTION_FACTORS: Record<string, number> = {
  managed: 1.0,
  "managed-well-semi-aerobic": 0.5,
  "managed-poorly-active-aeration": 0.4,
  "unmanaged-5m-more-deep": 0.8,
  "unmanaged-5m-less-deep": 0.4,
  uncategorized: 0.6,
};

// factors of each fraction of waste type for methane generation formula
const FOOD_FACTOR = 0.15;
const GARDEN_WASTE_FACTOR = 0.2;
const PAPER_FACTOR = 0.4;
const WOOD_FACTOR = 0.43;
const TEXTILES_FACTOR = 0.24;
const INDUSTRIAL_WASTE_FACTOR = 0.15;

const DEFAULT_METHANE_PRODUCTION_CAPACITY = 0.25; // kg CH4/kg COD

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

export function handleVkt1Formula(
  activityValue: ActivityValue,
  gasValues: GasValueWithEmissionsFactor[],
): Gas[] {
  const data = activityValue.activityData;
  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use the formula",
    );
  }

  const gases = gasValues?.map((gasValue) => {
    if (!gasValue.gas) {
      throw new createHttpError.BadRequest(
        "Activity has a GasValue with no `gas` name",
      );
    }
    const emissionsFactor = gasValue.emissionsFactor;
    if (emissionsFactor?.emissionsPerActivity == null) {
      throw new createHttpError.BadRequest(
        `Emissions factor for ${emissionsFactor?.gas} has no emissions per activity`,
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

  const getFraction = (key: string) => (data[key] || 0) / 100.0;
  const [
    foodFraction,
    gardenWasteFraction,
    paperFraction,
    woodFraction,
    textilesFraction,
    industrialWasteFraction,
  ] = [
    "food-fraction",
    "garden-waste-fraction",
    "paper-fraction",
    "wood-fraction",
    "textiles-fraction",
    "industrial-waste-fraction",
  ].map(getFraction);

  const landfillType = data["landfill-type"];
  // Rewrite the property accesses in data here to use kebab-case instead of camelCase.

  const recoveredMethaneFraction = data["recovered-methane-fraction"] || 0;
  const oxidationFactor = data["landfill-type"].startsWith("managed-well")
    ? 0.1
    : 0;
  const totalSolidWaste = data["total-solid-waste"] || 0;

  // Degradable organic carbon in year of deposition, fraction (tonnes C/tonnes waste)
  const degradableOrganicCarbon =
    FOOD_FACTOR * foodFraction +
    GARDEN_WASTE_FACTOR * gardenWasteFraction +
    PAPER_FACTOR * paperFraction +
    WOOD_FACTOR * woodFraction +
    TEXTILES_FACTOR * textilesFraction +
    INDUSTRIAL_WASTE_FACTOR * industrialWasteFraction;

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
  gasValues: GasValueWithEmissionsFactor[],
): Gas[] {
  // TODO add actvityAmount column to ActivityValue
  // const activityAmount = activityValue.activityAmount || 0;
  // TODO perform these calculations using BigInt/ BigNumber?
  const data = activityValue.activityData;
  const activityAmount = data ? data["activity-amount"] || 0 : 0;
  const gases = gasValues?.map((gasValue) => {
    const emissionsFactor = gasValue.emissionsFactor;
    if (emissionsFactor == null) {
      throw new createHttpError.BadRequest(
        "Missing emissions factor for activity",
      );
    }
    if (emissionsFactor.emissionsPerActivity == null) {
      throw new createHttpError.BadRequest(
        `Emissions factor for ${emissionsFactor?.gas} has no emissions per activity`,
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

export function handleIndustrialWasteWaterFormula(
  activityValue: ActivityValue,
): Gas[] {
  const data = activityValue.activityData;
  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use the formula",
    );
  }

  const totalIndustrialProduction = data["total-industrial-production"];
  const wastewaterGenerated = data["wastewater-generated"];
  const degradableOrganicComponents = data["degradable-organic-components"];
  const methaneProductionCapacity =
    data["methane-production-capacity"] ?? DEFAULT_METHANE_PRODUCTION_CAPACITY; // TODO should this only be handled UI-side?
  const removedSludge = data["removed-sludge"];
  const methaneCorrectionFactor = data["methane-correction-factor"];
  const methaneRecovered = data["methane-recovered"];

  // TODO is BigInt/ BigNumber required for these calculations?
  const totalOrganicWaste =
    totalIndustrialProduction *
    wastewaterGenerated *
    degradableOrganicComponents;
  const emissionsFactor = methaneProductionCapacity * methaneCorrectionFactor;
  const totalMethaneProduction =
    (totalOrganicWaste - removedSludge) * emissionsFactor - methaneRecovered;
  const amount = BigInt(totalMethaneProduction);
  return [{ gas: "CH4", amount }];
}

export function handleDomesticWasteWaterFormula(
  activityValue: ActivityValue,
): Gas[] {
  const data = activityValue.activityData;
  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use the formula",
    );
  }

  const methaneProductionCapacity =
    data["methane-production-capacity"] ?? DEFAULT_METHANE_PRODUCTION_CAPACITY; // TODO should this only be handled UI-side?
  const removedSludge = data["removed-sludge"];
  const methaneCorrectionFactor = data["methane-correction-factor"];
  const methaneRecovered = data["methane-recovered"];

  const totalCityPopulation = data["total-city-population"]; // TODO not in form - get from City/ Population table?
  const bodPerCapita = data["bod-per-capita"]; // TODO not in form?
  const isCollectedWasteWater =
    data["wastewater-inside-industrial-calculator-collection-status"] ===
    "collection-status-type-wastewater-collected";
  const industrialBodFactor = isCollectedWasteWater ? 1.0 : 1.25;
  const totalOrganicWaste =
    totalCityPopulation * bodPerCapita * industrialBodFactor * 365;

  const incomeGroupFraction = data["income-group-fraction"];
  const dischargeSystemUtulizationRatio =
    data["discharge-system-utilization-ratio"];

  const emissionsFactor =
    methaneProductionCapacity *
    methaneCorrectionFactor *
    incomeGroupFraction *
    dischargeSystemUtulizationRatio;
  const totalMethaneProduction =
    (totalOrganicWaste - removedSludge) * emissionsFactor - methaneRecovered;
  const amount = BigInt(totalMethaneProduction);
  return [{ gas: "CH4", amount }];
}
