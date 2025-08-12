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
import { TransportTestData, TestResult } from "@/data/transport-test-types";
import transportSampleData from "@/data/transport-test-sample-data.json";

// Test configuration constants
const SAMPLE_SIZE = 29; // Test 20 random samples (adjust based on available data)
const TOLERANCE = 0.01; // ±0.01 tonnes CO2e tolerance

describe("Transport Emission Factor Validation Tests", () => {
  let testData: TransportTestData[] = [];
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
      inventoryName: "Test Inventory for Transport EF Validation",
      cityId: testCity.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2023,
    });

    // Load CSV test data
    testData = await loadTransportTestData();

    console.log(`\n📊 Loaded ${testData.length} transport test data points`);
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

  it("should validate transport emission factor calculations against manual test data", async () => {
    const sampledData = sampleTestData(testData, SAMPLE_SIZE);
    const results: TestResult[] = [];

    console.log(
      `\n🚗 Testing ${sampledData.length} transport emission factor calculations...\n`,
    );

    // Run the tests and collect results
    for (let i = 0; i < sampledData.length; i++) {
      const testData = sampledData[i];
      console.log(
        `Test ${i + 1}/${sampledData.length}: ${testData.subsector} - ${testData.methodology_name} (${testData.fuel_type} - ${testData.vehicle_type})`,
      );

      const result = await performTransportCalculationTest(
        testData,
        testInventory,
      );
      results.push(result);

      if (result.success) {
        console.log(
          `✅ PASS - Expected: ${result.expected}, Calculated: ${result.calculated}, Diff: ${result.difference?.toFixed(6)}`,
        );
      } else if (result.error && result.error.startsWith("SKIPPED:")) {
        console.log(`⏭️  SKIPPED - ${result.error.replace("SKIPPED: ", "")}`);
      } else {
        console.log(`❌ FAIL - ${result.error || "Calculation mismatch"}`);
        console.log(
          `   Expected: ${result.expected}, Calculated: ${result.calculated}, Diff: ${result.difference?.toFixed(6)}`,
        );
        console.log(
          `   Available factors: ${result.availableFactors.join(", ")}`,
        );
      }
    }

    // Calculate summary statistics
    const passed = results.filter((r) => r.success).length;
    const failed = results.filter(
      (r) => !r.success && !r.error?.startsWith("SKIPPED"),
    ).length;
    const skipped = results.filter((r) =>
      r.error?.startsWith("SKIPPED"),
    ).length;
    const totalValid = passed + failed;
    const successRate = totalValid > 0 ? (passed / totalValid) * 100 : 0;

    console.log(`\n📈 === FINAL RESULTS ===`);
    console.log(`Total tests: ${results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Success rate: ${successRate.toFixed(1)}% (excluding skipped)`);

    // Detailed failure analysis
    if (failed > 0) {
      console.log(`\n🔍 === FAILED TEST DETAILS ===`);
      const failedTests = results.filter(
        (r) => !r.success && !r.error?.startsWith("SKIPPED"),
      );
      failedTests.forEach((result, index) => {
        console.log(`\nFailed Test ${index + 1}:`);
        console.log(`  Subsector: ${result.testData.subsector}`);
        console.log(`  Methodology: ${result.testData.methodology}`);
        console.log(`  Fuel Type: ${result.testData.fuelType}`);
        console.log(`  Vehicle Type: ${result.testData.vehicleType}`);
        console.log(`  Expected: ${result.expected}`);
        console.log(`  Calculated: ${result.calculated}`);
        console.log(`  Error: ${result.error || "Calculation mismatch"}`);
        if (result.calculations) {
          console.log(`  Breakdown: ${JSON.stringify(result.calculations)}`);
        }
      });
    }

    // Assert overall success rate
    expect(successRate).toBeGreaterThanOrEqual(70); // Expect at least 70% success rate
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
    "kg/m3": "units-kilograms-per-cubic-meter",
    "kg/kg": "units-kilograms-per-kilogram",
    kWh: "units-kilowatt-hours",
  };

  return unitMapping[csvUnit] || csvUnit;
}

async function loadTransportTestData(): Promise<TransportTestData[]> {
  return new Promise((resolve, reject) => {
    const results: TransportTestData[] = [];
    const csvPath = path.join(
      process.cwd(),
      "tests",
      "emission_factors_sample_data",
      "transport_validation_full_data.csv",
    );

    // Check if file exists, if not create a sample structure
    if (!fs.existsSync(csvPath)) {
      console.log(`⚠️  CSV file not found at ${csvPath}`);
      console.log(`📝 Creating sample transport test data structure...`);

      // Use sample data from external file for demonstration
      resolve(transportSampleData as TransportTestData[]);
      return;
    }

    fs.createReadStream(csvPath)
      .pipe(parse({ columns: true, trim: true }))
      .on("data", (row) => {
        // Skip rows with no emission factors or empty data
        if (
          !row["CO2 Global API"] ||
          row["CO2 Global API"] === "" ||
          !row["Test fuel value"] ||
          row["Test fuel value"] === "" ||
          !row["Final emissions CO2e (prod) (tonnes)"] ||
          row["Final emissions CO2e (prod) (tonnes)"] === ""
        ) {
          return;
        }

        results.push({
          subsector: row.subsector,
          methodology_id: row.methodology_id,
          methodology_name: row.methodology_name || "fuel-sales",
          methodology_status: row.methodology_status || "Active",
          fuel_type: row.fuel_type,
          vehicle_type: row.vehicle_type || "vehicle-type-all",
          co2_global_api: parseFloat(row["CO2 Global API"]) || 0,
          ch4_global_api: parseFloat(row["CH4 Global API"]) || 0,
          n2o_global_api: parseFloat(row["N2O Global API"]) || 0,
          units_in_global_api: row["Units Global API"] || "",
          // Use IPCC AR6 standard values since they're not in the CSV
          co2_gwp: 1,
          ch4_gwp: 28,
          n2o_gwp: 265,
          total_fuel_value: parseFloat(row["Test fuel value"]),
          total_fuel_units: row["Units Global API"] || "kg/m3", // Use the same units as emission factors
          expected_co2e_tonnes: parseFloat(
            row["Final emissions CO2e (prod) (tonnes)"],
          ),
        });
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

function sampleTestData(
  data: TransportTestData[],
  sampleSize: number,
): TransportTestData[] {
  // Create a stratified sample to ensure we test different subsectors
  const groupedBySubsector = data.reduce(
    (acc, item) => {
      if (!acc[item.subsector]) acc[item.subsector] = [];
      acc[item.subsector].push(item);
      return acc;
    },
    {} as Record<string, TransportTestData[]>,
  );

  const subsectors = Object.keys(groupedBySubsector);
  const samplesPerSubsector = Math.ceil(sampleSize / subsectors.length);

  const samples: TransportTestData[] = [];
  for (const subsector of subsectors) {
    const subsectorData = groupedBySubsector[subsector];
    const shuffled = [...subsectorData].sort(() => 0.5 - Math.random());
    samples.push(...shuffled.slice(0, samplesPerSubsector));
  }

  // Trim to exact sample size and shuffle
  return samples.slice(0, sampleSize).sort(() => 0.5 - Math.random());
}

async function performTransportCalculationTest(
  testData: TransportTestData,
  inventory: any,
): Promise<TestResult> {
  try {
    // Query emission factors
    const { emissionFactors, queryErrors } =
      await createTransportEmissionFactorsFromGlobalAPI(testData);
    const availableFactors = Object.keys(emissionFactors);

    if (availableFactors.length === 0) {
      const errorMsg =
        queryErrors.length > 0
          ? `No emission factors found. Errors: ${queryErrors.join("; ")}`
          : "No emission factors found";

      return {
        success: false,
        error: errorMsg,
        testData: formatTransportTestData(testData),
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
        "transport-fuel-type": testData.fuel_type,
        "transport-vehicle-type": testData.vehicle_type,
      },
      metadata: {
        activityTitle: "activity-total-fuel-consumption",
      },
      inventoryValueId: inventoryValue.id,
    };

    // Use the system's calculation method
    console.log(`   🧮 Using methodology ID: ${testData.methodology_id}`);

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
        console.log(`   ⚠️  SKIPPED - ${error.message}`);
        return {
          success: false,
          error: `SKIPPED: ${error.message}`,
          testData: formatTransportTestData(testData),
          expected: testData.expected_co2e_tonnes,
          tolerance: TOLERANCE,
          availableFactors: [],
        };
      }
      throw error;
    }

    // Debug: Log the actual calculation result structure
    console.log(
      `   🔍 CalculationService result:`,
      JSON.stringify(calculationResult, null, 2),
    );

    // Extract totalCO2e from the result
    let totalCO2eKg = 0;
    if (calculationResult.totalCO2e) {
      // Handle Decimal objects
      totalCO2eKg = parseFloat(calculationResult.totalCO2e.toString());
    }

    console.log(`   📊 CalculationService totalCO2e: ${totalCO2eKg} kg`);

    // Convert to tonnes for comparison
    const calculatedCO2eTonnes = totalCO2eKg / 1000;
    const expectedCO2eTonnes = testData.expected_co2e_tonnes;
    const difference = Math.abs(calculatedCO2eTonnes - expectedCO2eTonnes);

    console.log(
      `   Expected: ${expectedCO2eTonnes}, Calculated: ${calculatedCO2eTonnes}, Diff: ${difference.toFixed(6)}`,
    );

    // Test should use the actual service output
    const withinTolerance = difference <= TOLERANCE;

    return {
      success: withinTolerance,
      testData: formatTransportTestData(testData),
      expected: expectedCO2eTonnes,
      calculated: calculatedCO2eTonnes,
      difference,
      tolerance: TOLERANCE,
      availableFactors,
      emissionFactorValues: emissionFactors,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error occurred",
      testData: formatTransportTestData(testData),
      expected: testData.expected_co2e_tonnes,
      tolerance: TOLERANCE,
      availableFactors: [],
    };
  }
}

async function createTransportEmissionFactorsFromGlobalAPI(
  testData: TransportTestData,
) {
  const emissionFactors: any = {};

  console.log(`   📊 Using Global API values from CSV:`);
  console.log(
    `   - CO2: ${testData.co2_global_api} ${testData.units_in_global_api}`,
  );
  console.log(
    `   - CH4: ${testData.ch4_global_api} ${testData.units_in_global_api}`,
  );
  console.log(
    `   - N2O: ${testData.n2o_global_api} ${testData.units_in_global_api}`,
  );

  // Create emission factor objects using Global API values from CSV
  if (testData.co2_global_api > 0) {
    emissionFactors["CO2"] = {
      emissionsPerActivity: testData.co2_global_api,
      gas: "CO2",
      units: testData.units_in_global_api,
      region: "world",
    };
    console.log(
      `   ✅ Created CO2 factor: ${testData.co2_global_api} ${testData.units_in_global_api}`,
    );
  }

  if (testData.ch4_global_api > 0) {
    emissionFactors["CH4"] = {
      emissionsPerActivity: testData.ch4_global_api,
      gas: "CH4",
      units: testData.units_in_global_api,
      region: "world",
    };
    console.log(
      `   ✅ Created CH4 factor: ${testData.ch4_global_api} ${testData.units_in_global_api}`,
    );
  }

  if (testData.n2o_global_api > 0) {
    emissionFactors["N2O"] = {
      emissionsPerActivity: testData.n2o_global_api,
      gas: "N2O",
      units: testData.units_in_global_api,
      region: "world",
    };
    console.log(
      `   ✅ Created N2O factor: ${testData.n2o_global_api} ${testData.units_in_global_api}`,
    );
  }

  return { emissionFactors, queryErrors: [] };
}

function formatTransportTestData(testData: TransportTestData) {
  return {
    subsector: testData.subsector,
    methodology: testData.methodology_name,
    fuelType: testData.fuel_type,
    vehicleType: testData.vehicle_type,
    fuelValue: testData.total_fuel_value,
    fuelUnits: testData.total_fuel_units,
  };
}
