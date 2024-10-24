import { CreateActivityValueRequest } from "@/util/validation";

export const ReferenceNumber = "I.1.1";

// Direct measure test data
export const validCreateActivity: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 100,
    ch4_amount: 100,
    n2o_amount: 100,
    "residential-building-type": "building-type-all",
    "residential-building-fuel-type": "fuel-type-charcoal",
    "residential-buildings-fuel-source": "source",
  },
  metadata: {
    active_selection: "test1",
  },
  inventoryValue: {
    inputMethodology: "direct-measure",
    gpcReferenceNumber: ReferenceNumber,
    unavailableReason: "Reason for unavailability",
    unavailableExplanation: "Explanation for unavailability",
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg",
      },
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 2000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg",
      },
    },
  ],
};
export const updatedActivityValue: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 120,
    ch4_amount: 160,
    n2o_amount: 100,
    "residential-building-type": "building-type-all",
    "residential-building-fuel-type": "fuel-type-anthracite",
    "residential-buildings-fuel-source": "source-edit",
  },
  metadata: {
    "active-selection": "test1",
  },
  inventoryValue: {
    inputMethodology: "direct-measure",
    gpcReferenceNumber: ReferenceNumber,
    unavailableReason: "Reason for unavailability",
    unavailableExplanation: "Explanation for unavailability",
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg",
      },
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 4000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg",
      },
    },
  ],
};
export const invalidCreateActivity: CreateActivityValueRequest = {
  activityData: {
    "form-test-input1": 40.4,
    "form-test-input2": "132894729485739867398473321",
    "form-test-input3": "agriculture-forestry",
  },
  metadata: {
    "active-selection": "test1",
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg",
      },
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 2000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg",
      },
    },
  ],
};

// Activity times emissions factor activity-times-emissions-factor
export const validCreateActivityTimesEmissionsFactor: CreateActivityValueRequest =
  {
    activityData: {
      co2_amount: 100,
      ch4_amount: 100,
      n2o_amount: 100,
      "residential-building-type": "building-type-all",
      "residential-building-fuel-type": "fuel-type-charcoal",
      "residential-buildings-fuel-source": "source",
    },
    metadata: {
      active_selection: "test1",
    },
    inventoryValue: {
      inputMethodology: "activity-amount-times-emissions-factor",
      gpcReferenceNumber: ReferenceNumber,
      unavailableReason: "Reason for unavailability",
      unavailableExplanation: "Explanation for unavailability",
    },
    gasValues: [
      {
        id: "123e4567-e89b-12d3-a456-426614174001",
        gas: "CO2",
        gasAmount: 1000n,
        emissionsFactor: {
          emissionsPerActivity: 50.5,
          gas: "CO2",
          units: "kg",
        },
      },
      {
        id: "123e4567-e89b-12d3-a456-426614174003",
        gas: "CH4",
        gasAmount: 2000n,
        emissionsFactor: {
          emissionsPerActivity: 25.0,
          gas: "CH4",
          units: "kg",
        },
      },
    ],
  };

export const invalidCreateActivityTimesEmissionsFactor: CreateActivityValueRequest =
  {
    activityData: {
      co2_amount: "100",
      ch4_amount: "100",
      n2o_amount: "100",
      "residential-building-type": 1,
      "residential-building-fuel-type": 1,
      "residential-buildings-fuel-source": 1,
    },
    metadata: {
      active_selection: "test1",
    },
    inventoryValue: {
      inputMethodology: "test-methodology",
      gpcReferenceNumber: ReferenceNumber,
      unavailableReason: "Reason for unavailability",
      unavailableExplanation: "Explanation for unavailability",
    },
    gasValues: [],
  };

export const updatedActivityValueWithFormula: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 100,
    ch4_amount: 100,
    n2o_amount: 120,
    "residential-building-type": "building-type-all",
    "residential-building-fuel-type": "fuel-type-anthracite",
    "residential-buildings-fuel-source": "source-edit",
  },
  metadata: {
    "active-selection": "test2",
  },
  inventoryValue: {
    inputMethodology: "activity-amount-times-emissions-factor",
    gpcReferenceNumber: ReferenceNumber,
    unavailableReason: "Reason for unavailability",
    unavailableExplanation: "Explanation for unavailability",
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg",
      },
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 4000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg",
      },
    },
  ],
};

export const invalidupdatedActivityValueWithFormula: CreateActivityValueRequest =
  {
    activityData: {
      co2_amount: "100",
      ch4_amount: "100",
      n2o_amount: "120",
      "residential-building-type": "building-type-all",
      "residential-building-fuel-type": "fuel-type-anthracite",
      "residential-buildings-fuel-source": "source-edit",
    },
    metadata: {
      "active-selection": "test2",
    },
    inventoryValue: {
      inputMethodology: "test-formula",
      gpcReferenceNumber: "X.1.1",
      unavailableReason: "Reason for unavailability",
      unavailableExplanation: "Explanation for unavailability",
    },
    gasValues: [],
  };

export const activityUnits = "UNITS";
export const activityValue = 1000;
export const co2eq = 44000n;
export const locode = "XX_INVENTORY_CITY_ACTIVITY_VALUE";
// Matches name given by CDP for API testing
export const cityName =
  "Open Earth Foundation API City Discloser activity value";
export const cityCountry =
  "United Kingdom of Great Britain and Northern Ireland";
export const inventoryName = "TEST_INVENTORY_INVENTORY_ACTIVITY_VALUE";
export const sectorName = "XX_INVENTORY_TEST_SECTOR_ACTIVITY_VALUE";
export const subcategoryName = "XX_INVENTORY_TEST_SUBCATEGORY_ACTIVITY_VALUE";
export const subsectorName = "XX_INVENTORY_TEST_SUBSECTOR_1_ACTIVITY_VALUE";
