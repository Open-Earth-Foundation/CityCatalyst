import { randomUUID } from "node:crypto";

export const inventoryId = randomUUID();
export const inventoryValueId1 = randomUUID();
export const inventoryValueId2 = randomUUID();
export const inventoryValueId3 = randomUUID();

export const inventoryValues = [
  {
    id: inventoryValueId1,
    activityUnits: null,
    activityValue: null,
    co2eq: 500n,
    subCategoryId: "942f2e36-ab1f-3fbf-af9e-31d997f518c7",
    inventoryId,
    co2eqYears: 100,
    gpcReferenceNumber: "I.2.1",
    sectorId: "5da765a9-1ca6-37e1-bcd6-7b387f909a4e",
    unavailableReason: "",
    unavailableExplanation: "",
    subSectorId: "a235005c-f223-3c64-a0d2-f55d6f22f32f",
    inputMethodology: "fuel-combustion-commercial-buildings-methodology",
  },
  {
    id: inventoryValueId2,
    activityUnits: null,
    activityValue: null,
    co2eq: 200n,
    subCategoryId: "942f2e36-ab1f-3fbf-af9e-31d997f518c7",
    inventoryId,
    co2eqYears: 100,
    gpcReferenceNumber: "I.2.1",
    sectorId: "5da765a9-1ca6-37e1-bcd6-7b387f909a4e",
    unavailableReason: "",
    unavailableExplanation: "",
    subSectorId: "a235005c-f223-3c64-a0d2-f55d6f22f32f",
    inputMethodology: "fuel-combustion-commercial-buildings-methodology",
  },
  {
    id: inventoryValueId3,
    activityUnits: null,
    activityValue: null,
    co2Eq: 300n,
    subCategoryId: "58a9822a-fae0-3831-9f8b-4ec1fb48a54f",
    inventoryId,
    datasourceId: "814d43fd-42bf-49f9-a10f-2c5486cf0344",
    co2EqYears: 100,
    gpcReferenceNumber: "I.1.1",
    sectorId: "5da765a9-1ca6-37e1-bcd6-7b387f909a4e",
    unavailableReason: "",
    unavailableExplanation: "",
    subSectorId: "abe4c7b0-242d-3ed2-a146-48885d6fb38d",
    inputMethodology: "direct-measure",
  },
];

export const activityValues = [
  {
    id: randomUUID(),
    inventoryValueId: inventoryValueId1,
    metadata: { emissionFactorType: "6a508faa-80a8-3246-9941-90d8cc8dec85" },
    co2eq: 500n,
    co2eqYears: 100,
    activityData: {
      "data-source": "source",
      "commercial-building-type": "type-commercial-institutional",
      "commercial-building-fuel-type": "fuel-type-natural-gas",
      "activity-total-fuel-consumption": "200",
      "activity-total-fuel-consumption-unit": "units-gallons",
    },
  },
  {
    id: randomUUID(),
    inventoryValueId: inventoryValueId2,
    metadata: { emissionFactorType: "6a508faa-80a8-3246-9941-90d8cc8dec85" },
    co2eq: 200n,
    co2eqYears: 100,
    activityData: {
      "data-source": "datasource",
      "commercial-building-type": "type-institutional-buildings",
      "commercial-building-fuel-type": "fuel-type-natural-gas",
      "activity-total-fuel-consumption": "200000000",
      "activity-total-fuel-consumption-unit": "units-gallons",
    },
  },
  {
    id: randomUUID(),
    inventoryValueId: inventoryValueId3,
    datasourceId: "6bbbab3d-2978-4e7d-a2a7-295ecf35f338",
    metadata: { emissionFactorType: "" },
    co2eq: 300n,
    co2eqYears: 100,
    activityData: {
      ch4_amount: 29,
      co2_amount: 66,
      n2o_amount: 19,
      "residential-building-type": "residential-building-type-all",
      "residential-building-fuel-type": "fuel-type-gasoline",
      "residential-buildings-fuel-source": "Sit ad impedit par",
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
