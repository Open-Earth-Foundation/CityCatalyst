import { CreateActivityValueRequest } from "@/util/validation";

export const ReferenceNumber = "I.1.1";
export const validCreateActivity: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 100,
    ch4_amount: 100,
    n2o_amount: 100,
    "residential-building-type": "building-type-all",
    "residential-building-fuel-type": "fuel-type-charcoal",
    "residential-buildings-fuel-source": "source"
  },
  metadata: {
    active_selection: "test1"
  },
  inventoryValue: {
    inputMethodology: "direct-measure",
    gpcReferenceNumber: ReferenceNumber,
    unavailableReason: "Reason for unavailability",
    unavailableExplanation: "Explanation for unavailability"
  },
  dataSource: {
    sourceType: "",
    dataQuality: "high",
    notes: "Some notes regarding the data source"
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg"
      }
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 2000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg"
      }
    }
  ]
};
export const updatedActivityValue: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 120,
    ch4_amount: 160,
    n2o_amount: 100,
    "residential-building-type": "building-type-all",
    "residential-building-fuel-type": "fuel-type-anthracite",
    "residential-buildings-fuel-source": "source-edit"
  },
  metadata: {
    "active-selection": "test1"
  },
  inventoryValue: {
    inputMethodology: "direct-measure",
    gpcReferenceNumber: ReferenceNumber,
    unavailableReason: "Reason for unavailability",
    unavailableExplanation: "Explanation for unavailability"
  },
  dataSource: {
    sourceType: "updated-type",
    dataQuality: "high",
    notes: "Some notes regarding the data source"
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg"
      }
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 4000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg"
      }
    }
  ]
};
export const invalidCreateActivity: CreateActivityValueRequest = {
  activityData: {
    "form-test-input1": 40.4,
    "form-test-input2": "132894729485739867398473321",
    "form-test-input3": "agriculture-forestry"
  },
  metadata: {
    "active-selection": "test1"
  },
  dataSource: {
    sourceType: "",
    dataQuality: "high",
    notes: "Some notes regarding the data source"
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg"
      }
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 2000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg"
      }
    }
  ]
};
export const activityUnits = "UNITS";
export const activityValue = 1000;
export const co2eq = 44000n;
export const locode = "XX_INVENTORY_CITY_ACTIVITY_VALUE";
// Matches name given by CDP for API testing
export const cityName = "Open Earth Foundation API City Discloser activity value";
export const cityCountry = "United Kingdom of Great Britain and Northern Ireland";
export const inventoryName = "TEST_INVENTORY_INVENTORY_ACTIVITY_VALUE";
export const sectorName = "XX_INVENTORY_TEST_SECTOR_ACTIVITY_VALUE";
export const subcategoryName = "XX_INVENTORY_TEST_SUBCATEGORY_ACTIVITY_VALUE";
export const subsectorName = "XX_INVENTORY_TEST_SUBSECTOR_1_ACTIVITY_VALUE";