import createHttpError from "http-errors";

import type { ActivityValue } from "@/models/ActivityValue";
import type { Gas } from "./CalculationService";
import type { GasValueCreationAttributes } from "@/models/GasValue";
import type { EmissionsFactorAttributes } from "@/models/EmissionsFactor";
import type { Inventory } from "@/models/Inventory";
import { db } from "@/models";
import { InventoryValue } from "@/models/InventoryValue";
import { Decimal } from "decimal.js";
import { findMethodology } from "@/util/form-schema";
import UnitConversionService from "@/backend/UnitConversionService";
import { literal, Op } from "sequelize";
import { logger } from "@/services/logger";

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
      logger.warn(
        `dryMatterContentI is missing for ${wasteType} a default of 1 used`,
      );
    }

    if (fractionOfCarbonInput == null) {
      logger.warn(
        `fractionOfCarbonI is missing for ${wasteType} a default of 1 used`,
      );
    }

    if (fractionOfFossilCarbonInput == null) {
      logger.warn(
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

export async function handleMethaneCommitmentFormula(
  activityValue: ActivityValue,
  inventoryValue: InventoryValue,
  inputMethodology: string,
): Promise<Gas[]> {
  if (!inventoryValue.inputMethodology || !inventoryValue.gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "InventoryValue has no inputMethodology or gpcReferenceNumber associated",
    );
  }

  let methodologyIdentifier = inputMethodology;

  if (inputMethodology.endsWith("-methodology")) {
    methodologyIdentifier = inputMethodology.slice(0, -"-methodology".length); // Remove the suffix from the end
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
    data[`${methodologyIdentifier}-waste-composition`] ?? {};

  // TODO this dropdown input is not part of manual input spec for III.1.1
  const landfillType = data["landfill-type"];

  const recoveredMethaneFraction = data["methane-collected-and-removed"] || 0;
  const oxidationFactor =
    data[`${methodologyIdentifier}-oxidation-factor`] ===
    "oxidation-factor-well-managed-landfill"
      ? 0.1
      : 0;
  const totalSolidWaste = data["total-municipal-solid-waste-disposed"] || 0;

  const wasteCategories = {
    "waste-composition-food": "carbon-content-food",
    "waste-composition-garden": "carbon-content-garden",
    "waste-composition-paper": "carbon-content-paper",
    "waste-composition-wood": "carbon-content-wood",
    "waste-composition-textiles": "carbon-content-textiles",
    "waste-composition-industrial": "carbon-content-industrial",
    "waste-composition-leather": "carbon-content-leather",
    "waste-composition-plastics": "carbon-content-plastics",
    "waste-composition-metal": "carbon-content-metal",
    "waste-composition-glass": "carbon-content-glass",
    "waste-composition-nappies": "carbon-content-nappies",
    "waste-composition-other": "carbon-content-other",
  };

  // Fetch all necessary waste factors
  const wasteFactorsData = await db.models.FormulaInput.findAll({
    where: {
      parameterCode: {
        [Op.iLike]: `%cc_%`,
      },
      methodologyName: inputMethodology,
      actorId: "world",
    },
  });

  const carbonFactorMap = new Map<string, number>();
  for (const item of wasteFactorsData) {
    carbonFactorMap.set(item.parameterName, item.formulaInputValue);
  }

  // Calculate degradable organic carbon
  let degradableOrganicCarbon = 0;

  for (const key of Object.keys(wasteCategories)) {
    const carbonContentKey =
      wasteCategories[key as keyof typeof wasteCategories];
    const factor = carbonFactorMap.get(carbonContentKey) || 0;
    const fraction = (percentageBreakdown[key] || 0) / 100.0;

    if (factor !== undefined) {
      degradableOrganicCarbon += factor * fraction;
    }
  }

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
    const amount = Decimal.mul(activityAmount, emissionsFactor.emissionsPerActivity);

    return { gas: gasValue.gas!, amount };
  });

  return gases;
}

export async function handleIndustrialWasteWaterFormula(
  activityValue: ActivityValue,
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

  const totalIndustrialProduction = data["total-industry-production"];
  const industryType = data[`${prefixKey}-industry-type`];
  const treatmentType = data[`${prefixKey}-treatment-type`];
  const treatmentStatus = data[`${prefixKey}-treatment-status`];
  let wastewaterGenerated = data[`${prefixKey}-wastewater-generated`]; // should this be gotten from UI or
  const countryCode = inventoryValue.inventory.city.countryLocode;
  const formulaInputsDOC = await db.models.FormulaInput.findOne({
    where: {
      [`metadata.industry_type`]: industryType as string,
      gas: "CH4",
      parameterCode: "COD",
      formulaName: "industrial-wastewater",
      gpcRefno: inventoryValue.gpcReferenceNumber,
      [Op.or]: [
        { actorId: { [Op.iLike]: "%world%" } },
        { actorId: { [Op.iLike]: `%${countryCode}%` } },
      ],
    },
    order: [
      // Prioritize specific country matches first
      [
        literal(
          `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
        ),
        "ASC",
      ],
    ],
  });

  if (!wastewaterGenerated) {
    wastewaterGenerated = await db.models.FormulaInput.findOne({
      where: {
        [`metadata.industry_type`]: industryType as string,
        gas: "CH4",
        parameterCode: "Wi",
        formulaName: "industrial-wastewater",
        [Op.or]: [
          { actorId: { [Op.iLike]: "%world%" } },
          { actorId: { [Op.iLike]: `%${countryCode}%` } },
        ],
      },
      order: [
        // Prioritize specific country matches first
        [
          literal(
            `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
          ),
          "ASC",
        ],
      ],
    });
  }

  const formulaInputMCF = await db.models.FormulaInput.findOne({
    where: {
      [`metadata.treatment-type`]: treatmentType as string,
      [`metadata.treatment-status`]: treatmentStatus as string,
      gas: "CH4",
      parameterCode: "MCF",
      methodologyName: `${prefixKey}-activity`,
      [Op.or]: [
        { actorId: { [Op.iLike]: `%${countryCode}%` } },
        { actorId: { [Op.iLike]: "%world%" } },
      ],
    },
    order: [
      // Prioritize specific country matches first
      [
        literal(
          `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
        ),
        "ASC",
      ],
    ],
  });

  const degradableOrganicComponents = formulaInputsDOC?.formulaInputValue ?? 1;

  const methaneProductionCapacity = DEFAULT_METHANE_PRODUCTION_CAPACITY;
  const removedSludge = data["total-organic-sludge-removed"];
  const methaneCorrectionFactor = formulaInputMCF?.formulaInputValue || 0.3; // TODO fetch this from formula values csv dependent on treatment type

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

  const removedSludge = data["total-organic-sludge-removed"];
  const methaneRecovered = data[`${prefixKey}-methane-recovered`];
  const totalPopulation = data["total-population"];
  const collectionStatus = data[`${prefixKey}-collection-status`];
  const isCollectedWasteWater =
    collectionStatus === "collection-status-type-wastewater-collected";
  const industrialBodFactor = isCollectedWasteWater ? 1.25 : 1.0;
  const treatmentStatus = data[`${prefixKey}-treatment-status`];
  const treatmentName = data[`${prefixKey}-treatment-name`] as string;
  const treatmentType = data[`${prefixKey}-treatment-type`];
  const incomeGroup = data[`${prefixKey}-income-group`];
  const methaneProductionCapacity = 0.6; // Bo takes default value of 0.6 for domestic
  const countryCode = inventoryValue.inventory.city.countryLocode;

  // where clause filter

  const formulaInputMCF = await db.models.FormulaInput.findOne({
    where: {
      [`metadata.treatment-type`]: treatmentType as string,
      [`metadata.treatment-status`]: treatmentStatus as string,
      gas: "CH4",
      parameterCode: "MCF",
      methodologyName: `${prefixKey}-activity`,
      [Op.or]: [
        { actorId: { [Op.iLike]: `%${countryCode}%` } },
        { actorId: { [Op.iLike]: "%world%" } },
      ],
    },
    order: [
      // Prioritize specific country matches first
      [
        literal(
          `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
        ),
        "ASC",
      ],
    ],
  });
  const MethaneCorrectionFactor = formulaInputMCF?.formulaInputValue || 0; // TODO confirm if a non zero default is okay
  const formulaInputDOU = await db.models.FormulaInput.findOne({
    where: {
      [`metadata.income-group`]: incomeGroup as string,
      [`metadata.treatment-name`]: treatmentName.includes("latrine")
        ? "latrine"
        : treatmentName,
      gas: "CH4",
      formulaInputValue: { [Op.ne]: 0 },
      parameterCode: "U*T",
      methodologyName: `${prefixKey}-activity`,
      [Op.or]: [
        { actorId: { [Op.iLike]: `%${countryCode}%` } },
        { actorId: { [Op.iLike]: "%world%" } },
      ],
    },
    order: [
      // Prioritize specific country matches first
      [
        literal(
          `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
        ),
        "ASC",
      ],
    ],
  });

  const degreeOfUtilization = formulaInputDOU?.formulaInputValue || 0;

  // calculate the EFj
  const EFj = new Decimal(
    methaneProductionCapacity * MethaneCorrectionFactor * degreeOfUtilization,
  );

  // calculate TOW
  const formulaInputBOD = await db.models.FormulaInput.findOne({
    where: {
      gas: "CH4",
      parameterCode: "BOD",
      methodologyName: `${prefixKey}-activity`,
      [Op.or]: [
        { actorId: { [Op.iLike]: `%${countryCode}%` } },
        { actorId: { [Op.iLike]: "%world%" } },
      ],
    },
    order: [
      // Prioritize specific country matches first
      [
        literal(
          `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
        ),
        "ASC",
      ],
    ],
  });

  const bodPerCapita = (formulaInputBOD?.formulaInputValue as number) / 1000; // default unit is in g/person/day divide by 1000 to get kg/person/day

  const formulaInputUI = await db.models.FormulaInput.findOne({
    where: {
      [`metadata.income-group`]: incomeGroup as string,
      gas: "CH4",
      parameterCode: "Ui",
      methodologyName: `${prefixKey}-activity`,
      [Op.or]: [
        { actorId: { [Op.iLike]: `%${countryCode}%` } },
        { actorId: { [Op.iLike]: "%world%" } },
      ],
    },
    order: [
      // Prioritize specific country matches first
      [
        literal(
          `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
        ),
        "ASC",
      ],
    ],
  });

  const utilizationByIncomeGroup = formulaInputUI?.formulaInputValue || 1; //  TODO is the default of 1 the best ?

  const cityPopulationByIncomegroup =
    totalPopulation / utilizationByIncomeGroup;

  const totalOrganicWaste = new Decimal(
    cityPopulationByIncomegroup * bodPerCapita * industrialBodFactor * 365,
  );

  const totalMethaneProduction = totalOrganicWaste
    .sub(removedSludge)
    .mul(EFj)
    .sub(methaneRecovered);

  const ch4amount = totalMethaneProduction.round();

  // calculate the total n20 emissions
  const garbageDisposalType = data[`${prefixKey}-garbage-disposal`];
  const f_non_con =
    garbageDisposalType === "garbage-disposal-type-garbage-disposals"
      ? 1.4
      : 1.1;

  const f_ind_com = 1.25;

  const formulaInputProtein = await db.models.FormulaInput.findOne({
    where: {
      parameterCode: "protein",
      gas: "N2O",
      methodologyName: `${prefixKey}-activity`,
      [Op.or]: [
        { actorId: { [Op.iLike]: `%${countryCode}%` } },
        { actorId: { [Op.iLike]: "%world%" } },
      ],
    },
    order: [
      // Prioritize specific country matches first
      [
        literal(
          `CASE WHEN actor_id ILIKE '%${countryCode}%' THEN 1 ELSE 2 END`,
        ),
        "ASC",
      ],
    ],
  });

  const proteinValue = formulaInputProtein?.formulaInputValue || 0;

  const n2oValueFirstTerm =
    cityPopulationByIncomegroup * proteinValue * 0.16 * f_non_con * f_ind_com;
  const ef_fluent = 0.005;

  const n20Emission = new Decimal(n2oValueFirstTerm)
    .sub(removedSludge)
    .mul(ef_fluent)
    .mul(44 / 28);

  return [
    { gas: "CH4", amount: ch4amount },
    {
      gas: "N2O",
      amount: n20Emission.round(),
    },
  ];

  // TODO include N20 calculations
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
