import createHttpError from "http-errors";

import type { ActivityValue } from "@/models/ActivityValue";
import type { Gas } from "./CalculationService";
import type { GasValueCreationAttributes } from "@/models/GasValue";
import type { EmissionsFactorAttributes } from "@/models/EmissionsFactor";
import { findClosestCityPopulation } from "@/util/population";
import type { Inventory } from "@/models/Inventory";
import { db } from "@/models";
import { InventoryValue } from "@/models/InventoryValue";

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

const formulaInputsMapping: Record<string, string> = {
  "waste-composition-clinical-waste": "waste-type-clinical",
  "waste-composition-hazardous-waste": "waste-type-hazardous",
  "waste-composition-industrial-solid-waste": "waste-type-industrial",
  "waste-composition-municipal-solid-waste": "waste-type-municipal-solid-waste",
  "waste-composition-sewage-sludge": "waste-type-sludge",
};

// factors of each fraction of waste type for methane generation formula
const FOOD_FACTOR = 0.15;
const GARDEN_WASTE_FACTOR = 0.2;
const PAPER_FACTOR = 0.4;
const WOOD_FACTOR = 0.43;
const TEXTILES_FACTOR = 0.24;
const INDUSTRIAL_WASTE_FACTOR = 0.15;

const DEFAULT_METHANE_PRODUCTION_CAPACITY = 0.25; // kg CH4/kg COD
const DEFAULT_METHANE_CORRECTION_FACTOR = 1.0; // TODO get correct one from FormulaInputs/ FormulaValues once that is loaded
const DEFAULT_BOD_PER_CAPITA = 40; // TODO this is a placeholder, get the actual value from IPCC!!!

// TODO get actual values for each contry from IPCC
const DEFAULT_INCOME_GROUP_FRACTIONS: Record<string, number> = {
  "income-group-type-all": 1.0,
  "income-group-type-rural": 0.23,
  "income-group-type-urban-high-income": 0.5,
  "income-group-type-urban-low-income": 0.27,
};

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

export async function handleIncinerationWasteFormula(
  activityValue: ActivityValue,
  inventoryValue: InventoryValue,
): Promise<Gas[]> {
  const data = activityValue.activityData;

  const CH4EmissionFactor = {
    "technology-continuous-incineration": {
      "boiler-type-stoker": 0.2,
      "boiler-type-fluidised-bed": 0,
    },
    "technology-semi-continuous-incineration": {
      "boiler-type-stoker": 6,
      "boiler-type-fluidised-bed": 188,
    },
    "technology-batch-type-incineration": {
      "boiler-type-stoker": 60,
      "boiler-type-fluidised-bed": 237,
    },
  };

  const NO2EmissionFactor = {
    "waste-composition-municipal-solid-waste": {
      "technology-continuous-incineration": 50,
      "technology-semi-continuous-incineration": 50,
      "technology-batch-type-incineration": 0,
      "technology-open-burning": 150,
    },
    "waste-composition-hazardous-waste": {
      "technology-continuous-incineration": 100,
      "technology-semi-continuous-incineration": 100,
      "technology-batch-type-incineration": 100,
      "technology-open-burning": 100,
    },
    "waste-composition-clinical-waste": {
      "technology-continuous-incineration": 0,
      "technology-semi-continuous-incineration": 0,
      "technology-batch-type-incineration": 0,
      "technology-open-burning": 0,
    },
    "waste-composition-industrial-solid-waste": {
      "technology-continuous-incineration": 0,
      "technology-semi-continuous-incineration": 0,
      "technology-batch-type-incineration": 0,
      "technology-open-burning": 0,
    },
    "waste-composition-sewage-sludge": {
      "technology-continuous-incineration": 0,
      "technology-semi-continuous-incineration": 0,
      "technology-batch-type-incineration": 0,
      "technology-open-burning": 0,
    },
  };

  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use 'incineration-waste' formula",
    );
  }

  const activityTitle = activityValue.metadata?.["activityTitle"];
  const massOfIncineratedWaste = data[activityTitle];
  const wasteComposition =
    data["incineration-waste-inboundary-waste-composition"];

  let totalCO2Emissions = 0;
  let totalCH4Emission = 0;
  let totalNO2Emissions = 0;

  for (const wasteType of Object.keys(wasteComposition)) {
    const WasteFractionI = wasteComposition[wasteType] / 100;
    // get the dry matter state by searching the db
    const formulaInputs = await db.models.FormulaInput.findAll({
      where: {
        [`metadata.waste-type`]: formulaInputsMapping[wasteType] as string,
        formulaName: "incineration-waste",
        gpcRefno: inventoryValue.gpcReferenceNumber,
      },
    });

    console.log("formula-inputs", formulaInputs, wasteType);
  }

  throw createHttpError.BadRequest("not yet ready");

  return [];

  // {
  //   "id": "incineration-waste-inboundary-activity",
  //     "unique-by": [
  //   "incineration-waste-inboundary-incineration-facility-id"
  // ],
  //     "activity-title": "total-mass-of-waste-incinerated-or-burned",
  //     "extra-fields": [
  //   {
  //     "id": "incineration-waste-inboundary-incineration-facility-id",
  //     "type": "text"
  //   },
  //   {
  //     "id": "incineration-waste-inboundary-incineration-facility-address",
  //     "type": "text",
  //     "required": false
  //   },
  //   {
  //     "id": "incineration-waste-inboundary-waste-composition",
  //     "type": "percentage-breakdown",
  //     "total-required": 100,
  //     "subtypes": [
  //       "waste-composition-municipal-solid-waste",
  //       "waste-composition-industrial-solid-waste",
  //       "waste-composition-hazardous-waste",
  //       "waste-composition-clinical-waste",
  //       "waste-composition-sewage-sludge"
  //     ]
  //   },
  //   {
  //     "id": "incineration-waste-inboundary-technology",
  //     "options": [
  //       "technology-continuous-incineration",
  //       "technology-semi-continuous-incineration",
  //       "technology-batch-type-incineration"
  //     ]
  //   },
  //   {
  //     "id": "incineration-waste-inboundary-boiler-type",
  //     "options": [
  //       "boiler-type-stoker",
  //       "boiler-type-fluidised-bed"
  //     ]
  //   }
  // ],
  //     "units": [
  //   "units-kilograms",
  //   "units-tonnes"
  // ]
  // }
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

  const percentageBreakdown =
    data["methane-commitment-solid-waste-inboundary-waste-composition"] ?? {};
  const getFraction = (key: string) => (percentageBreakdown[key] || 0) / 100.0;
  const [
    foodFraction,
    gardenWasteFraction,
    paperFraction,
    woodFraction,
    textilesFraction,
    industrialWasteFraction,
  ] = [
    "food",
    "garden-waste",
    "paper",
    "wood",
    "textiles",
    "industrial-waste",
  ].map(getFraction);

  // TODO this dropdown input is not part of manual input spec for III.1.1
  const landfillType = data["landfill-type"];

  const recoveredMethaneFraction =
    data[
      "methane-commitment-solid-waste-inboundary-methane-collected-and-removed"
    ] || 0;
  const oxidationFactor =
    data["methane-commitment-solid-waste-inboundary-oxidation-factor"] ===
    "oxidation-factor-well-managed-landfill"
      ? 0.1
      : 0;
  const totalSolidWaste = data["methane-commitment-solid-waste-disposed"] || 0;

  // Degradable organic carbon in year of deposition, fraction (tonnes C/tonnes waste)
  const degradableOrganicCarbon =
    FOOD_FACTOR * foodFraction +
    GARDEN_WASTE_FACTOR * gardenWasteFraction +
    PAPER_FACTOR * paperFraction +
    WOOD_FACTOR * woodFraction +
    TEXTILES_FACTOR * textilesFraction +
    INDUSTRIAL_WASTE_FACTOR * industrialWasteFraction;

  const methaneCorrectionFactor =
    METHANE_CORRECTION_FACTORS[landfillType] ?? 0.6;
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
  const activityAmountKey = activityValue.metadata?.["activityTitle"];
  const activityAmount = data?.[activityAmountKey] || 0;
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
      Math.ceil(activityAmount * emissionsFactor.emissionsPerActivity),
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

export async function handleDomesticWasteWaterFormula(
  activityValue: ActivityValue,
  inventory: Inventory,
): Promise<Gas[]> {
  const data = activityValue.activityData;
  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use the formula",
    );
  }

  const methaneProductionCapacity = DEFAULT_METHANE_PRODUCTION_CAPACITY; // TODO should this only be handled UI-side?
  const removedSludge =
    data["wastewater-inside-domestic-calculator-total-organic-sludge-removed"];
  // TODO get MCF from seed-data/formula_values
  const methaneCorrectionFactor = DEFAULT_METHANE_CORRECTION_FACTOR;
  const methaneRecovered =
    data["wastewater-inside-domestic-calculator-methane-recovered"];

  const totalCityPopulationEntry = await findClosestCityPopulation(inventory);
  if (!totalCityPopulationEntry) {
    throw new createHttpError.BadRequest(
      "No recent city population entry was found.",
    );
  }
  const totalCityPopulation = totalCityPopulationEntry.population;

  const bodPerCapita = DEFAULT_BOD_PER_CAPITA;
  const isCollectedWasteWater =
    data["wastewater-inside-industrial-calculator-collection-status"] ===
    "collection-status-type-wastewater-collected";
  const industrialBodFactor = isCollectedWasteWater ? 1.0 : 1.25;
  const totalOrganicWaste =
    totalCityPopulation * bodPerCapita * industrialBodFactor * 365;

  const incomeGroup =
    data["wastewater-inside-domestic-calculator-income-group"] ??
    "income-group-type-all";
  const incomeGroupFraction = DEFAULT_INCOME_GROUP_FRACTIONS[incomeGroup];
  const dischargeSystemUtulizationRatio =
    data["discharge-system-utilization-ratio"] ?? 0.5; // TODO wrong key!

  const emissionsFactor =
    methaneProductionCapacity *
    methaneCorrectionFactor *
    incomeGroupFraction *
    dischargeSystemUtulizationRatio;

  const totalMethaneProduction =
    (totalOrganicWaste - removedSludge) * emissionsFactor - methaneRecovered;
  const amount = BigInt(Math.round(totalMethaneProduction)); // TODO round right or is ceil/ floor more correct?
  return [{ gas: "CH4", amount }];
}

/**
 * Handles the biological treatment formula for calculating emissions of gases.
 * @param activityValue - The activity value to calculate emissions for.
 * @returns The calculated emissions of gases.
 * @throws {createHttpError.BadRequest} If the activity value has no data associated.
 */
export async function handleBiologicalTreatmentFormula(
  activityValue: ActivityValue,
): Promise<Gas[]> {
  const data = activityValue.activityData;
  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use the formula",
    );
  }
  const wasteState =
    data["biological-treatment-inboundary-waste-state"] ??
    data["biological-treatment-outboundary-waste-state"] ??
    "invalid";
  const treatmentType =
    data["biological-treatment-inboundary-treatment-type"] ??
    data["biological-treatment-outboundary-treatment-type"] ??
    "invalid";

  if (treatmentType === "invalid") {
    throw createHttpError.BadRequest("Invalid waste state type");
  }
  if (wasteState === "invalid") {
    throw createHttpError.BadRequest("Invalid treatment type");
  }

  let emissionsFactor = NaN;
  if (treatmentType === "treatment-type-composting") {
    emissionsFactor = wasteState === "waste-state-dry-waste" ? 10 : 4;
  } else if (treatmentType === "treatment-type-anaerobic-digestion") {
    emissionsFactor = wasteState === "waste-state-dry-waste" ? 2 : 0.8;
  } else if (treatmentType === "treatment-type-all-organic-waste") {
    throw createHttpError.BadRequest("Treatment type all not supported yet!");
  }

  const organicWasteMass = data["total-organic-waste-treated"] ?? 0;
  const totalCH4Emitted = (organicWasteMass * emissionsFactor) / 1000;
  const totalCH4Recovered =
    data["biological-treatment-inboundary-total-of-ch4-recovered"] ?? 0;
  // TODO improve this using decimal/ big number library
  const resultCH4 =
    BigInt(Math.round(totalCH4Emitted)) - BigInt(totalCH4Recovered);
  return [{ gas: "CH4", amount: resultCH4 }];
}
