import { randomUUID } from "node:crypto";

export const inventoryValueId = randomUUID();
export const inventoryValueId1 = randomUUID();
export const inventoryValueId2 = randomUUID();
export const inventoryId = randomUUID();

export const inventoryValues = [
  {
    id: inventoryValueId,
    activityUnits: null,
    activityValue: null,
    co2eq: BigInt(40399),
    subCategoryId: "58a9822a-fae0-3831-9f8b-4ec1fb48a54f",
    inventoryId: inventoryId,
    co2eqYears: 100,
    gpcReferenceNumber: "I.1.1",
    sectorId: "5da765a9-1ca6-37e1-bcd6-7b387f909a4e",
    unavailableReason: "",
    unavailableExplanation: "",
    subSectorId: "abe4c7b0-242d-3ed2-a146-48885d6fb38d",
    inputMethodology: "fuel-combustion-residential-buildings-methodology",
  },
  {
    id: inventoryValueId1,
    activityUnits: null,
    activityValue: null,
    co2eq: BigInt(22388),
    subCategoryId: "064d8e7c-cddb-3766-8c70-579a1908c866",
    inventoryId: inventoryId,
    co2eqYears: 100,
    gpcReferenceNumber: "II.1.1",
    sectorId: "73eb7b71-159c-3eda-b7fc-f6eb53754dc3",
    unavailableReason: "",
    unavailableExplanation: "",
    subSectorId: "48fcfadb-90ed-34aa-80d9-fa31a90bef80",
    inputMethodology: "direct-measure",
  },
  {
    id: inventoryValueId2,
    activityUnits: null,
    activityValue: null,
    co2eq: BigInt(10581),
    subCategoryId: "e7218f77-9896-30db-8a47-afb6b1d084a8",
    inventoryId: inventoryId,
    co2eqYears: 100,
    gpcReferenceNumber: "III.1.3",
    sectorId: "d5acb72e-d915-310f-b3a3-77f634bcbf5e",
    unavailableReason: "",
    unavailableExplanation: "",
    subSectorId: "172d10c0-6b80-3173-902e-eca5c0af84c8",
    inputMethodology: "direct-measure",
  },
];

export const activityValues = [
  {
    id: randomUUID(),

    inventoryValueId: inventoryValueId,
    metadata: { emissionFactorType: "", totalFuelConsumption: "" },
    co2eq: BigInt(15662),
    co2eqYears: 100,
    activityDataJsonb: {
      ch4Amount: 19,
      co2Amount: 25,
      n2oAmount: 57,
      onRoadTransportFuelType: "fuel-type-cng",
      onRoadTransportFuelSource: "Dolorum lorem volupt",
      onRoadTransportVehicleType: [
        "vehicle-type-passenger-vehicles",
        "vehicle-type-commercial-vehicles",
        "vehicle-type-public-transport-vehicles",
        "vehicle-type-emergency-vehicles",
        "vehicle-type-service-vehicles",
      ],
    },
  },
  {
    id: randomUUID(),

    inventoryValueId: inventoryValueId,
    metadata: { emissionFactorType: "", totalFuelConsumption: "" },
    co2eq: BigInt(6726),
    co2eqYears: 100,
    activityDataJsonb: {
      ch4Amount: 12,
      co2Amount: 30,
      n2oAmount: 24,
      onRoadTransportFuelType: "fuel-type-diesel",
      onRoadTransportFuelSource: "Voluptate duis accus",
      onRoadTransportVehicleType: [
        "vehicle-type-passenger-vehicles",
        "vehicle-type-commercial-vehicles",
        "vehicle-type-public-transport-vehicles",
        "vehicle-type-emergency-vehicles",
        "vehicle-type-service-vehicles",
      ],
    },
  },
  {
    id: randomUUID(),

    inventoryValueId: inventoryValueId2,
    metadata: { emissionFactorType: "", totalFuelConsumption: "" },
    co2eq: BigInt(6367),
    co2eqYears: 100,
    activityDataJsonb: {
      ch4Amount: 92,
      co2Amount: 81,
      n2oAmount: 14,
      landfillId: "Esse consequuntur op",
      landfillAddress: "Nulla earum placeat",
      directMeasureSolidWasteInboundarySource: "Sed consequuntur vel",
    },
  },
  {
    id: randomUUID(),

    inventoryValueId: inventoryValueId2,
    metadata: { emissionFactorType: "", totalFuelConsumption: "" },
    co2eq: BigInt(10581),
    co2eqYears: 100,
    activityDataJsonb: {
      ch4Amount: 82,
      co2Amount: 70,
      n2oAmount: 31,
      landfillId: "Consequat Vero aut ",
      landfillAddress: "Natus dolorem quod e",
      directMeasureSolidWasteOutboundarySource: "Fugit illo qui volu",
    },
  },
  {
    id: randomUUID(),

    inventoryValueId: inventoryValueId1,
    metadata: { emissionFactorType: "", totalFuelConsumption: "" },
    co2eq: BigInt(6043),
    co2eqYears: 100,
    activityDataJsonb: {
      ch4Amount: 17,
      co2Amount: 2,
      n2oAmount: 21,
      residentialBuildingType: "residential-building-type-all",
      residentialBuildingFuelType: "fuel-type-charcoal",
      residentialBuildingsFuelSource: "Ex quibusdam iure in",
    },
  },
  {
    id: randomUUID(),

    inventoryValueId: inventoryValueId1,
    metadata: { emissionFactorType: "", totalFuelConsumption: "" },
    co2eq: BigInt(12903),
    co2eqYears: 100,
    activityDataJsonb: {
      ch4Amount: 72,
      co2Amount: 22,
      n2oAmount: 41,
      residentialBuildingType: "residential-building-type-all",
      residentialBuildingFuelType: "fuel-type-liquefied-petroleum-gases",
      residentialBuildingsFuelSource: "Magna minima laborio",
    },
  },
  {
    id: randomUUID(),

    inventoryValueId: inventoryValueId1,
    metadata: { emissionFactorType: "", totalFuelConsumption: "" },
    co2eq: BigInt(21453),
    co2eqYears: 100,
    activityDataJsonb: {
      ch4Amount: 45,
      co2Amount: 53,
      n2oAmount: 76,
      residentialBuildingType: "residential-building-type-all",
      residentialBuildingFuelType: "fuel-type-natural-gas",
      residentialBuildingsFuelSource: "Deserunt porro do eu",
    },
  },
];

export const baseInventory = {
  cityPopulation: 0,
  regionPopulation: 0,
  countryPopulation: 0,
  cityPopulationYear: 0,
  regionPopulationYear: 0,
  countryPopulationYear: 0,
};
