import createHttpError from "http-errors";

import type { ActivityValue } from "@/models/ActivityValue";
import type { Gas } from "./CalculationService";
import type { GasValueCreationAttributes } from "@/models/GasValue";
import type { EmissionsFactorAttributes } from "@/models/EmissionsFactor";
import { findClosestCityPopulation } from "@/util/population";
import type { Inventory } from "@/models/Inventory";
import { db } from "@/models";
import { InventoryValue } from "@/models/InventoryValue";
import { Decimal } from "decimal.js";
import { findMethodology } from "@/util/form-schema";
import UnitConversionService from "@/backend/UnitConversionService";

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
  "waste-composition-sewage-sludge": "waste-type-sewage-sludge",
};

const IncinerationWasteCO2OxidationFactor: Record<string, number> = {
  "technology-continuous-incineration": 1,
  "technology-semi-continuous-incineration": 1,
  "technology-batch-type-incineration": 1,
  "technology-open-burning": 0.58,
};

const IncinerationWasteCH4EmissionFactor: Record<
  string,
  Record<string, number>
> = {
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

const IncinerationWasteN2OEmissionFactor: Record<
  string,
  Record<string, number>
> = {
  "waste-composition-municipal-solid-waste": {
    "technology-continuous-incineration": 50,
    "technology-semi-continuous-incineration": 50,
    "technology-batch-type-incineration": 50,
    "technology-open-burning": 150,
  },
  "waste-composition-industrial-solid-waste": {
    "technology-continuous-incineration": 100,
    "technology-semi-continuous-incineration": 100,
    "technology-batch-type-incineration": 100,
    "technology-open-burning": 100,
  },
  "waste-composition-clinical-waste": {
    "technology-continuous-incineration": 100,
    "technology-semi-continuous-incineration": 100,
    "technology-batch-type-incineration": 100,
    "technology-open-burning": 100,
  },
  "waste-composition-hazardous-waste": {
    "technology-continuous-incineration": 100,
    "technology-semi-continuous-incineration": 100,
    "technology-batch-type-incineration": 100,
    "technology-open-burning": 100,
  },
  "waste-composition-sewage-sludge": {
    "technology-continuous-incineration": 900,
    "technology-semi-continuous-incineration": 900,
    "technology-batch-type-incineration": 900,
    "technology-open-burning": 900,
  },
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

// check if an extra field has a unit.
// if yes. take the selected unit, convert it to the default unit and return the value

// take in the activityData and the methodology
//
function convertDataToDefaultUnit(
  activityValue: ActivityValue,
  methodologyId: string,
  referenceNumber: string,
): Record<string, any> {
  const methododology = findMethodology(methodologyId, referenceNumber);
  if (!methododology) {
    throw new createHttpError.NotFound(
      `Could not find methodology for reference number ${referenceNumber}`,
    );
  }

  let activity = methododology.activities?.[0];

  // if methodologyId is !direct measure, and number of activities === 1 use the Oth activity
  if ((methododology.activities?.length as number) > 1) {
    let selectedActivityOption =
      activityValue.metadata?.[
        methododology.activitySelectionField?.id as string
      ];

    const foundIndex =
      methododology.activities?.findIndex(
        (ac) => ac.activitySelectedOption === selectedActivityOption,
      ) ?? 0;

    const selectedActivityIndex = foundIndex >= 0 ? foundIndex : 0;

    activity = methododology.activities?.[selectedActivityIndex];
  }
  // deal with activity title value

  let data: Record<string, any> = { ...activityValue.activityData };
  // check if it has a default unit property
  if (activity?.["default-units"]) {
    const val = data[activity?.["activity-title"] as string];
    const fuelTypeKey = Object.keys(data).find((key) =>
      key.includes("fuel-type"),
    );
    const fuelType = data[fuelTypeKey as string];
    const fromUnit = data[`${activity?.["activity-title"]}-unit`];
    data[activity?.["activity-title"] as string] = new Decimal(
      UnitConversionService.convertUnits(
        val,
        fromUnit,
        activity["default-units"],
        fuelType,
      ),
    );
  }

  if (activity?.["extra-fields"]) {
    activity["extra-fields"].forEach((field) => {
      let val = data[field.id];
      if (field.units && field["default-units"]) {
        data[field.id] = new Decimal(
          UnitConversionService.convertUnits(
            val,
            data[`${field.id}-unit`],
            field?.["default-units"],
          ),
        );
      }
    });
  }

  return data;
}

export function handleDirectMeasureFormula(
  activityValue: ActivityValue,
): Gas[] {
  // Extract activity data once to avoid repetitive access
  const data = activityValue.activityData;

  if (!data) {
    throw new createHttpError.BadRequest("Activity has no data associated");
  }

  // Initialize an array to hold gas objects
  const gases = GAS_NAMES.map((gasName) => {
    const key = `${gasName.toLowerCase()}_amount`;

    let amount;
    try {
      // values collected from the direct measure form are in tonnes. but we store the values in kg
      amount = new Decimal(data[key] ?? 0).mul(1000);
    } catch (error) {
      throw new createHttpError.BadRequest(
        `Invalid number format for ${key}: ${data[key]}`,
      );
    }

    // Ensure the amount is not negative (optional, based on business rules)
    if (amount.isNegative()) {
      throw new createHttpError.BadRequest(
        `Gas amount cannot be negative for ${key}`,
      );
    }

    return { gas: gasName, amount: amount };
  });

  // Check if all gas amounts are zero
  const allZero = gases.every((gas) => gas.amount.equals(0));

  if (allZero) {
    throw new createHttpError.BadRequest(
      "Direct measure requires a non zero gas amount",
    );
  }

  // TODO: Save amounts to GasValue entries or perform further processing

  return gases;
}

export async function handleIncinerationWasteFormula(
  activityValue: ActivityValue,
  inventoryValue: InventoryValue,
  formulaMapping: Record<string, string>,
): Promise<Gas[]> {
  const data = convertDataToDefaultUnit(
    // use convert all the values
    activityValue,
    inventoryValue.inputMethodology as string,
    inventoryValue.gpcReferenceNumber as string,
  );

  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use 'incineration-waste' formula",
    );
  }

  const activityTitle = activityValue.metadata?.["activityTitle"];
  const massOfIncineratedWaste = data[activityTitle] as number;
  const wastCompositionKey = formulaMapping["waste-composition"];
  const wasteComposition = data[wastCompositionKey];
  const technologyKey = formulaMapping["technology"];
  const technology = data[technologyKey] as string;
  const boilerTypeKey = formulaMapping["boiler-type"];
  const boilerType = data[boilerTypeKey] as string;

  let totalCH4Emission: Decimal = new Decimal(0);
  let totalN2OEmissions: Decimal = new Decimal(0);
  let totalPartialCO2Emissions: Decimal = new Decimal(0);

  for (const wasteType of Object.keys(wasteComposition)) {
    const WasteFractionI = wasteComposition[wasteType] / 100;

    const AmountOfWasteForWasteTypeI = massOfIncineratedWaste * WasteFractionI;

    const CH4EmissionFactorForWasteTypeI =
      IncinerationWasteCH4EmissionFactor[technology]?.[boilerType];

    const NO2EmissionFactorForWasteTypeI =
      IncinerationWasteN2OEmissionFactor[wasteType]?.[technology];

    if (CH4EmissionFactorForWasteTypeI == null) {
      throw new createHttpError.BadRequest(
        `No CH4 emission factor found for ${technology}, ${boilerType}`,
      );
    }

    if (NO2EmissionFactorForWasteTypeI == null) {
      throw new createHttpError.BadRequest(
        `No NO2 emission factor found for ${wasteType}, ${technology}`,
      );
    }

    totalCH4Emission = Decimal.sum(
      totalCH4Emission,
      Decimal.mul(
        AmountOfWasteForWasteTypeI,
        CH4EmissionFactorForWasteTypeI,
      ).mul(10 ** -3),
    );
    totalN2OEmissions = Decimal.sum(
      totalN2OEmissions,
      Decimal.mul(
        AmountOfWasteForWasteTypeI,
        NO2EmissionFactorForWasteTypeI,
      ).mul(10 ** -3),
    );

    // calculate CO2 emissions

    const formulaInputs = await db.models.FormulaInput.findAll({
      where: {
        [`metadata.waste-type`]: formulaInputsMapping[wasteType] as string,
        gas: "CO2",
        formulaName: "incineration-waste",
        gpcRefno: inventoryValue.gpcReferenceNumber,
        region: "world",
      },
    });

    const dryMatterInput = formulaInputs.find(
      (input) => input.parameterCode === "dmi",
    )?.formulaInputValue;

    const fractionOfCarbonInput = formulaInputs.find(
      (input) => input.parameterCode === "CFi",
    )?.formulaInputValue;

    const fractionOfFossilCarbonInput = formulaInputs.find(
      (input) => input.parameterCode === "FCFi",
    )?.formulaInputValue;

    const fractionOfFossilCarbonI =
      fractionOfFossilCarbonInput === null ||
      fractionOfFossilCarbonInput === undefined
        ? 0.2
        : fractionOfFossilCarbonInput;

    const dryMatterContentI =
      dryMatterInput === null || dryMatterInput === undefined
        ? 0.2
        : dryMatterInput;

    const fractionOfCarbonI =
      fractionOfCarbonInput === null || fractionOfCarbonInput === undefined
        ? 0.2
        : fractionOfCarbonInput;

    if (dryMatterInput == null) {
      console.warn(
        `dryMatterContentI is missing for ${wasteType} a default of 1 used`,
      );
    }

    if (fractionOfCarbonInput == null) {
      console.warn(
        `fractionOfCarbonI is missing for ${wasteType} a default of 1 used`,
      );
    }

    if (fractionOfFossilCarbonInput == null) {
      console.warn(
        `fractionOfFossilCarbonI is missing for ${wasteType} a default of 1 used`,
      );
    }

    const oxidationFactorI = IncinerationWasteCO2OxidationFactor[technology];

    totalPartialCO2Emissions = Decimal.sum(
      totalPartialCO2Emissions,
      Decimal.mul(WasteFractionI, dryMatterContentI)
        .mul(fractionOfCarbonI)
        .mul(fractionOfFossilCarbonI)
        .mul(oxidationFactorI),
    );
  }

  const totalCO2Emissions = totalPartialCO2Emissions.mul(
    massOfIncineratedWaste * (44 / 12),
  );

  return [
    {
      gas: "CH4",
      amount: new Decimal(totalCH4Emission).trunc(),
    },
    {
      gas: "N2O",
      amount: new Decimal(totalN2OEmissions).trunc(),
    },
    {
      gas: "CO2",
      amount: new Decimal(totalCO2Emissions).trunc(),
    },
  ];
}

export function handleVkt1Formula(
  activityValue: ActivityValue,
  gasValues: GasValueWithEmissionsFactor[],
  inventoryValue: InventoryValue,
): Gas[] {
  if (!inventoryValue.inputMethodology || !inventoryValue.gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "InventoryValue has no inputMethodology or gpcReferenceNumber associated",
    );
  }
  const data = convertDataToDefaultUnit(
    // use convert all the values
    activityValue,
    inventoryValue.inputMethodology,
    inventoryValue.gpcReferenceNumber,
  );
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
    const emissions = Decimal.mul(
      data["activity-value"] * data["intensity"],
      emissionsFactor.emissionsPerActivity,
    );
    return { gas: gasValue.gas, amount: emissions };
  });

  return gases;
}

export function handleMethaneCommitmentFormula(
  activityValue: ActivityValue,
  inventoryValue: InventoryValue,
): Gas[] {
  if (!inventoryValue.inputMethodology || !inventoryValue.gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "InventoryValue has no inputMethodology or gpcReferenceNumber associated",
    );
  }
  const data = convertDataToDefaultUnit(
    // use convert all the values
    activityValue,
    inventoryValue.inputMethodology,
    inventoryValue.gpcReferenceNumber,
  );

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
    "waste-composition-food",
    "waste-composition-garden",
    "waste-composition-paper",
    "waste-composition-wood",
    "waste-composition-textiles",
    "waste-composition-industrial",
  ].map(getFraction);

  // TODO this dropdown input is not part of manual input spec for III.1.1
  const landfillType = data["landfill-type"];

  const recoveredMethaneFraction = data["methane-collected-and-removed"] || 0;
  const oxidationFactor =
    data["methane-commitment-solid-waste-inboundary-oxidation-factor"] ===
    "oxidation-factor-well-managed-landfill"
      ? 0.1
      : 0;
  const totalSolidWaste = data["total-municipal-solid-waste-disposed"] || 0;

  // Degradable organic carbon in year of deposition, fraction (tonnes C/tonnes waste)
  const degradableOrganicCarbon =
    FOOD_FACTOR * foodFraction +
    GARDEN_WASTE_FACTOR * gardenWasteFraction +
    PAPER_FACTOR * paperFraction +
    WOOD_FACTOR * woodFraction +
    TEXTILES_FACTOR * textilesFraction +
    INDUSTRIAL_WASTE_FACTOR * industrialWasteFraction;

  // if the oxidation type is well managed, then the landfill is well managed and the methane correction factor is 1.0
  // otherwise, get the methane correction factor from the METHANE_CORRECTION_FACTORS object
  const methaneCorrectionFactor =
    oxidationFactor === 0.1
      ? 1.0
      : METHANE_CORRECTION_FACTORS[landfillType] ?? 0.6;

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

  const ch4Emissions = Decimal.mul(
    totalSolidWaste,
    methaneGenerationPotential,
  ).mul(
    Decimal.sub(1, recoveredMethaneFraction).mul(
      Decimal.sub(1, oxidationFactor),
    ),
  );

  return [{ gas: "CH4", amount: ch4Emissions }];
}

export function handleActivityAmountTimesEmissionsFactorFormula(
  activityValue: ActivityValue,
  gasValues: GasValueWithEmissionsFactor[],
  inventoryValue: InventoryValue,
): Gas[] {
  // TODO add actvityAmount column to ActivityValue
  // const activityAmount = activityValue.activityAmount || 0;
  if (!inventoryValue.inputMethodology || !inventoryValue.gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "InventoryValue has no inputMethodology or gpcReferenceNumber associated",
    );
  }
  const data = convertDataToDefaultUnit(
    // use convert all the values
    activityValue,
    inventoryValue.inputMethodology,
    inventoryValue.gpcReferenceNumber,
  );

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
    const amount = Decimal.mul(
      activityAmount,
      emissionsFactor.emissionsPerActivity,
    ).ceil();

    return { gas: gasValue.gas!, amount };
  });

  return gases;
}

export function handleIndustrialWasteWaterFormula(
  activityValue: ActivityValue,
  inventoryValue: InventoryValue,
  prefixKey: string,
): Gas[] {
  if (!inventoryValue.inputMethodology || !inventoryValue.gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "InventoryValue has no inputMethodology or gpcReferenceNumber associated",
    );
  }
  const data = convertDataToDefaultUnit(
    // use convert all the values
    activityValue,
    inventoryValue.inputMethodology,
    inventoryValue.gpcReferenceNumber,
  );
  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use the formula",
    );
  }

  const totalIndustrialProduction = data["total-industry-production"];
  const wastewaterGenerated = data[`${prefixKey}-wastewater-generated`];
  const degradableOrganicComponents =
    data["degradable-organic-components"] ?? 38; // TODO COD from formula values dependent on industry type;
  const methaneProductionCapacity =
    data["methane-production-capacity"] ?? DEFAULT_METHANE_PRODUCTION_CAPACITY;
  const removedSludge = data["total-organic-sludge-removed"];
  const methaneCorrectionFactor = 1; // TODO fetch this from formula values csv dependent on treatment type
  const methaneRecovered = data[`${prefixKey}-methane-recovered`];

  // TODO is new Decimal/ BigNumber required for these calculations?
  const totalOrganicWaste = Decimal.mul(
    totalIndustrialProduction,
    wastewaterGenerated,
  ).mul(degradableOrganicComponents);
  const emissionsFactor = methaneProductionCapacity * methaneCorrectionFactor;
  const totalMethaneProduction = totalOrganicWaste
    .sub(removedSludge)
    .mul(emissionsFactor)
    .sub(methaneRecovered);

  const amount = totalMethaneProduction.ceil();
  return [{ gas: "CH4", amount }];
}

// TODO how correct is this formula ?
export async function handleDomesticWasteWaterFormula(
  activityValue: ActivityValue,
  inventory: Inventory,
  inventoryValue: InventoryValue,
  prefixKey: string,
): Promise<Gas[]> {
  if (!inventoryValue.inputMethodology || !inventoryValue.gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "InventoryValue has no inputMethodology or gpcReferenceNumber associated",
    );
  }
  const data = convertDataToDefaultUnit(
    // use convert all the values
    activityValue,
    inventoryValue.inputMethodology,
    inventoryValue.gpcReferenceNumber,
  );
  if (!data) {
    throw new createHttpError.BadRequest(
      "Activity has no data associated, so it can't use the formula",
    );
  }

  const methaneProductionCapacity = DEFAULT_METHANE_PRODUCTION_CAPACITY; // TODO should this only be handled UI-side?
  const removedSludge = data["total-organic-sludge-removed"];
  // TODO get MCF from seed-data/formula_values
  const methaneCorrectionFactor = DEFAULT_METHANE_CORRECTION_FACTOR; // TODO read from formula file
  const methaneRecovered = data[`${prefixKey}-methane-recovered`];

  const totalCityPopulationEntry = await findClosestCityPopulation(inventory);
  if (!totalCityPopulationEntry) {
    throw new createHttpError.BadRequest(
      "No recent city population entry was found.",
    );
  }
  const totalCityPopulation = totalCityPopulationEntry.population;

  const bodPerCapita = DEFAULT_BOD_PER_CAPITA; // TODO BOD using region of the city
  const isCollectedWasteWater =
    data[`${prefixKey}-collection-status`] ===
    "collection-status-type-wastewater-collected";
  const industrialBodFactor = isCollectedWasteWater ? 1.0 : 1.25;
  const totalOrganicWaste = new Decimal(
    totalCityPopulation * bodPerCapita * industrialBodFactor * 365,
  );

  const incomeGroup =
    data[`${prefixKey}-income-group`] ?? "income-group-type-all";
  const incomeGroupFraction = DEFAULT_INCOME_GROUP_FRACTIONS[incomeGroup];
  const dischargeSystemUtulizationRatio =
    data["discharge-system-utilization-ratio"] ?? 0.5; // TODO wrong key!

  const emissionsFactor =
    methaneProductionCapacity *
    methaneCorrectionFactor *
    incomeGroupFraction *
    dischargeSystemUtulizationRatio;

  const totalMethaneProduction = totalOrganicWaste
    .sub(removedSludge)
    .mul(emissionsFactor)
    .sub(methaneRecovered);

  const amount = totalMethaneProduction.round(); // TODO round right or is ceil/ floor more correct?
  return [{ gas: "CH4", amount }];
}

/**
 * Handles the biological treatment formula for calculating emissions of gases.
 * @param activityValue - The activity value to calculate emissions for.
 * @param inventoryValue
 * @returns The calculated emissions of gases.
 * @throws {createHttpError.BadRequest} If the activity value has no data associated.
 */

// TODO ISSUE WITH WET WASTE NEEDS TO BE FIXED
export async function handleBiologicalTreatmentFormula(
  activityValue: ActivityValue,
  inventoryValue: InventoryValue,
  formulaMapping: Record<string, string>,
): Promise<Gas[]> {
  if (!inventoryValue.inputMethodology || !inventoryValue.gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "InventoryValue has no inputMethodology or gpcReferenceNumber associated",
    );
  }
  const data = convertDataToDefaultUnit(
    // use convert all the values
    activityValue,
    inventoryValue.inputMethodology,
    inventoryValue.gpcReferenceNumber,
  );

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
  const totalCH4Emitted = Decimal.mul(organicWasteMass, emissionsFactor).div(
    1000,
  );
  const totalCH4Recovered = data["total-of-ch4-recovered"] ?? 0; // TODO check this.
  const resultCH4 = totalCH4Emitted.round().sub(totalCH4Recovered);
  return [{ gas: "CH4", amount: resultCH4 }];
}
