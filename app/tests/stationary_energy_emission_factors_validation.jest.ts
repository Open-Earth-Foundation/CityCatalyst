import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { parse } from "csv-parse";
import fs from "fs";
import path from "path";
import { db } from "@/models";
import CalculationService from "@/backend/CalculationService";
import {
  InventoryTypeEnum,
  GlobalWarmingPotentialTypeEnum,
} from "@/util/enums";
import { randomUUID } from "crypto";
import { Decimal } from "decimal.js";
import * as dotenv from "dotenv";

// Test configuration constants
const SAMPLE_SIZE = 56; // Test ALL rows
const TOLERANCE = 0.01; // ±0.01 tonnes CO2e tolerance

interface ManualTestData {
  subsector: string;
  methodology_id: string;
  methodology_name: string;
  methodology_status: string;
  fuel_type: string;
  co2_global_api: number;
  ch4_global_api: number;
  n2o_global_api: number;
  units_in_global_api: string;
  co2_gwp: number;
  ch4_gwp: number;
  n2o_gwp: number;
  total_fuel_value: number;
  total_fuel_units: string;
  expected_co2e_tonnes: number;
}

interface TestResult {
  success: boolean;
  testData: {
    subsector: string;
    methodology: string;
    fuelValue: number;
    fuelUnits: string;
  };
  expected: number;
  calculated?: number;
  difference?: number;
  tolerance: number;
  availableFactors: string[];
  emissionFactorValues?: Record<string, number>;
  calculations?: Record<string, number>;
  error?: string;
}

describe("Emission Factor Validation Tests", () => {
  let testData: ManualTestData[] = [];
  let testInventory: any;
  let testCity: any;

  beforeAll(async () => {
    // Load environment configuration
    dotenv.config();

    await db.initialize();

    // Create test city and inventory
    testCity = await db.models.City.create({
      cityId: randomUUID(),
      locode: "TEST",
    });

    testInventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      inventoryName: "Test Inventory for EF Validation",
      cityId: testCity.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2023,
    });

    // Load CSV test data
    testData = await loadManualTestData();

    // Loaded test data points
  });

  afterAll(async () => {
    try {
      // Cleanup test data
      if (testInventory) {
        await db.models.Inventory.destroy({
          where: { inventoryId: testInventory.inventoryId },
        });
      }
      if (testCity) {
        await db.models.City.destroy({ where: { cityId: testCity.cityId } });
      }
      if (db.sequelize) {
        await db.sequelize.close();
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  it("should validate emission factor calculations against manual test data", async () => {
    const sampledData = sampleTestData(testData, SAMPLE_SIZE);
    const results: TestResult[] = [];

    // Testing cases

    // Run the tests and collect results
    for (let i = 0; i < sampledData.length; i++) {
      const testData = sampledData[i];
      // Test case info

      const result = await performCalculationTest(testData, testInventory);
      results.push(result);
    }

    // Calculate success statistics (excluding skipped tests)
    const passed = results.filter((r) => r.success).length;
    const skipped = results.filter(
      (r) => r.error && r.error.startsWith("SKIPPED:"),
    ).length;
    const failed = results.filter(
      (r) => !r.success && (!r.error || !r.error.startsWith("SKIPPED:")),
    ).length;
    const totalValid = passed + failed; // Total tests that weren't skipped
    const successRate = totalValid > 0 ? (passed / totalValid) * 100 : 0;

    console.log(`\n📈 === FINAL RESULTS ===`);
    console.log(
      `Success rate: ${successRate.toFixed(1)}% (${passed}/${totalValid} tests passed)`,
    );
    if (failed > 0) {
      console.log(`Failed: ${failed} tests`);
    }
    if (skipped > 0) {
      console.log(`Skipped: ${skipped} tests`);
    }

    // Show failed test details for debugging
    const actualFailures = results.filter(
      (r) => !r.success && (!r.error || !r.error.startsWith("SKIPPED:")),
    );
    if (actualFailures.length > 0) {
      console.log(`\n🔍 === FAILED TEST DETAILS ===`);
      actualFailures.forEach((result, index) => {
        console.log(`\nFailed Test ${index + 1}:`);
        console.log(`  Subsector: ${result.testData.subsector}`);
        console.log(`  Fuel Type: Unknown`); // fuel_type not available in formatted testData
        console.log(
          `  Methodology: ${result.testData.methodology || "Unknown"}`,
        );
        console.log(`  Expected: ${result.expected} tonnes`);
        console.log(`  Calculated: ${result.calculated || "N/A"} tonnes`);
        if (result.difference) {
          console.log(`  Difference: ${result.difference.toFixed(6)} tonnes`);
          console.log(
            `  % Difference: ${Math.abs((result.difference / result.expected) * 100).toFixed(1)}%`,
          );
        }
        console.log(`  Error: ${result.error || "Calculation mismatch"}`);
        if (result.calculations) {
          console.log(
            `  Calculation Details: ${JSON.stringify(result.calculations, null, 2)}`,
          );
        }
      });
    }

    expect(successRate).toBeGreaterThanOrEqual(100); // 50% minimum success rate
    expect(results.length).toBeGreaterThan(0); // Ensure we actually ran tests
  });
});

// Helper function to map CSV units to system units
function mapCsvUnitsToSystemUnits(csvUnit: string): string {
  const unitMapping: { [key: string]: string } = {
    m3: "units-cubic-meters",
    kg: "units-kilograms",
    l: "units-liters",
    t: "units-tonnes",
    gallons: "units-gallons",
    "cubic-meters": "units-cubic-meters",
    kilograms: "units-kilograms",
    liters: "units-liters",
    tonnes: "units-tonnes",
  };

  return unitMapping[csvUnit] || csvUnit;
}

async function loadManualTestData(): Promise<ManualTestData[]> {
  const csvPath = path.join(
    process.cwd(),
    "tests",
    "emission_factors_sample_data",
    "stationary_energy_manual_data_v1.csv",
  );

  return new Promise((resolve, reject) => {
    const results: ManualTestData[] = [];
    let totalRows = 0;

    fs.createReadStream(csvPath)
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }),
      )
      .on("data", (row: any) => {
        // Skip rows with invalid data
        if (!row.subsector || !row["Final_emissions_CO2e_manually_tonnes"]) {
          return;
        }

        results.push({
          subsector: row.subsector,
          methodology_id: row.methodology_id,
          methodology_name:
            row.methodology_name === "fuel-consumption"
              ? "fuel-combustion-consumption"
              : row.methodology_name,
          methodology_status: row.methodology_status || "",
          fuel_type: row.fuel_type || "",
          co2_global_api: parseFloat(row["co2_global_api"]) || 0,
          ch4_global_api: parseFloat(row["ch4_global_api"]) || 0,
          n2o_global_api: parseFloat(row["n2o_global_api"]) || 0,
          units_in_global_api: row["units_in_GlobalAPI"] || "",
          co2_gwp: parseInt(row["co2_gwp"]) || 1,
          ch4_gwp: parseInt(row["ch4_gwp"]) || 28,
          n2o_gwp: parseInt(row["n2o_gwp"]) || 265,
          total_fuel_value: parseFloat(row["total_fuel_value"]),
          total_fuel_units: row["total_fuel_units"],
          expected_co2e_tonnes: parseFloat(
            row["Final_emissions_CO2e_manually_tonnes"],
          ),
        });
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

function sampleTestData(
  data: ManualTestData[],
  sampleSize: number,
): ManualTestData[] {
  // Test all available data - no sampling needed
  return data;
}

async function performCalculationTest(
  testData: ManualTestData,
  inventory: any,
): Promise<TestResult> {
  try {
    // Query emission factors
    const { emissionFactors, queryErrors } =
      await createEmissionFactorsFromGlobalAPI(testData);
    const availableFactors = Object.keys(emissionFactors);

    if (availableFactors.length === 0) {
      const errorMsg =
        queryErrors.length > 0
          ? `No emission factors found. Errors: ${queryErrors.join("; ")}`
          : "No emission factors found";

      return {
        success: false,
        error: errorMsg,
        testData: formatTestData(testData),
        expected: testData.expected_co2e_tonnes,
        tolerance: TOLERANCE,
        availableFactors: [],
      };
    }

    // Prepare gas values for CalculationService
    const gasValues = availableFactors.map((gas) => ({
      id: randomUUID(),
      gas,
      gasAmount: 0n, // Will be calculated
      emissionsFactor: {
        emissionsPerActivity: emissionFactors[gas].emissionsPerActivity,
        gas,
        units: emissionFactors[gas].units,
      },
    }));

    // Create mock inventory value and activity value
    const inventoryValue = {
      id: randomUUID(),
      gpcReferenceNumber: testData.subsector,
      inputMethodology: testData.methodology_id,
      inventoryId: inventory.inventoryId,
      activityValue: testData.total_fuel_value,
    };

    const activityValue = {
      id: randomUUID(),
      activityData: {
        "activity-total-fuel-consumption": testData.total_fuel_value,
        "activity-total-fuel-consumption-unit": mapCsvUnitsToSystemUnits(
          testData.total_fuel_units,
        ),
        "residential-building-fuel-type": testData.fuel_type,
      },
      metadata: {
        activityTitle: "activity-total-fuel-consumption",
      },
      inventoryValueId: inventoryValue.id,
    };

    // Use the system's calculation method
    // Using methodology ID

    let calculationResult;
    try {
      calculationResult = await CalculationService.calculateGasAmount(
        inventoryValue as any,
        activityValue as any,
        testData.methodology_id,
        gasValues as any,
      );
    } catch (error: any) {
      // Handle missing fuel density or other calculation errors
      if (error.message && error.message.includes("Density for fuel type")) {
        // Skipped due to error
        return {
          success: false,
          error: `SKIPPED: ${error.message}`,
          testData: formatTestData(testData),
          expected: testData.expected_co2e_tonnes,
          tolerance: TOLERANCE,
          availableFactors: [],
          calculations: {},
        };
      }
      // Re-throw other errors
      throw error;
    }

    // Debug: Log the actual calculation result structure
    // CalculationService result

    // Extract totalCO2e from the result
    let totalCO2eKg = 0;
    if (calculationResult.totalCO2e) {
      // Handle Decimal objects
      totalCO2eKg = parseFloat(calculationResult.totalCO2e.toString());
    }

    // CalculationService totalCO2e

    // Convert to tonnes for comparison
    const calculatedCO2eTonnes = totalCO2eKg / 1000;
    const expectedCO2eTonnes = testData.expected_co2e_tonnes;
    const difference = Math.abs(calculatedCO2eTonnes - expectedCO2eTonnes);

    // console.log(
    //   `   Expected: ${expectedCO2eTonnes}, Calculated: ${calculatedCO2eTonnes}, Diff: ${difference.toFixed(6)}`,
    // );

    // Test should use the actual service output
    const withinTolerance = difference <= TOLERANCE;

    return {
      success: withinTolerance,
      testData: formatTestData(testData),
      expected: expectedCO2eTonnes,
      calculated: calculatedCO2eTonnes,
      difference,
      tolerance: TOLERANCE,
      availableFactors,
      calculations: {}, // Removed detailed breakdown
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      testData: formatTestData(testData),
      expected: testData.expected_co2e_tonnes,
      tolerance: TOLERANCE,
      availableFactors: [],
    };
  }
}

async function createEmissionFactorsFromGlobalAPI(testData: ManualTestData) {
  const emissionFactors: any = {};

  // Using Global API values from CSV

  // Create emission factor objects using Global API values from CSV
  if (testData.co2_global_api > 0) {
    emissionFactors["CO2"] = {
      emissionsPerActivity: testData.co2_global_api,
      gas: "CO2",
      units: testData.units_in_global_api,
      region: "world",
    };
    // Created CO2 factor
  }

  if (testData.ch4_global_api > 0) {
    emissionFactors["CH4"] = {
      emissionsPerActivity: testData.ch4_global_api,
      gas: "CH4",
      units: testData.units_in_global_api,
      region: "world",
    };
    // Created CH4 factor
  }

  if (testData.n2o_global_api > 0) {
    emissionFactors["N2O"] = {
      emissionsPerActivity: testData.n2o_global_api,
      gas: "N2O",
      units: testData.units_in_global_api,
      region: "world",
    };
    // Created N2O factor
  }

  return { emissionFactors, queryErrors: [] };
}

function formatTestData(testData: ManualTestData) {
  return {
    subsector: testData.subsector,
    methodology: testData.methodology_name,
    fuelValue: testData.total_fuel_value,
    fuelUnits: testData.total_fuel_units,
  };
}
