import { describe, expect, it } from "@jest/globals";
import UnitConversionService from "@/backend/UnitConversionService";
import { handleActivityAmountTimesEmissionsFactorFormula } from "@/backend/formulas";
import type { ActivityValue } from "@/models/ActivityValue";
import type { InventoryValue } from "@/models/InventoryValue";

/**
 * CC-942: Fuel Sales uses volume-based IPCC factors (kg/m³). Activity data may
 * be entered in mass units (tonnes/kg); conversion must use fuel density so
 * emissions match the same physical quantity in m³.
 */
describe("UnitConversionService fuel-sales mass↔volume (CC-942)", () => {
  const gasolineDensityKgPerM3 = 740;

  it("converts gasoline tonnes to cubic meters via density", () => {
    const tonnes = 222_000; // 300_000 m³ * 740 kg/m³ / 1000
    const m3 = UnitConversionService.convertUnits(
      tonnes,
      "units-tonnes",
      "units-cubic-meters",
      "fuel-type-gasoline",
    );
    expect(m3).toBeCloseTo(300_000, 5);
  });

  it("converts gasoline kilograms to cubic meters via density", () => {
    const kg = 300_000 * gasolineDensityKgPerM3;
    const m3 = UnitConversionService.convertUnits(
      kg,
      "units-kilograms",
      "units-cubic-meters",
      "fuel-type-gasoline",
    );
    expect(m3).toBeCloseTo(300_000, 5);
  });

  it("throws instead of returning NaN for unsupported mass→volume without fuel type", () => {
    expect(() =>
      UnitConversionService.convertUnits(
        100,
        "units-tonnes",
        "units-cubic-meters",
      ),
    ).toThrow(/not supported/i);
  });
});

describe("Fuel Sales formula mass vs volume units (CC-942)", () => {
  // IPCC-style gasoline factors from transport validation sample (kg/m³)
  const gasolineFactors = {
    CO2: { emissionsPerActivity: 2111.304, units: "kg/m3" },
    CH4: { emissionsPerActivity: 0.135876, units: "kg/m3" },
    N2O: { emissionsPerActivity: 0.135876, units: "kg/m3" },
  };

  function buildGasValues() {
    return Object.entries(gasolineFactors).map(([gas, factor]) => ({
      gas,
      emissionsFactor: {
        emissionsPerActivity: factor.emissionsPerActivity,
        gas,
        units: factor.units,
      },
    }));
  }

  function buildInventoryValue(): InventoryValue {
    return {
      gpcReferenceNumber: "II.1.1",
      inputMethodology: "fuel-sales-on-road-transport-methodology",
    } as InventoryValue;
  }

  function buildActivityValue(amount: number, unit: string): ActivityValue {
    return {
      activityData: {
        "activity-total-fuel-sales": amount,
        "activity-total-fuel-sales-unit": unit,
        "on-road-transport-fuel-type": "fuel-type-gasoline",
        "on-road-transport-vehicle-type": "vehicle-type-all",
      },
      metadata: {
        activityTitle: "activity-total-fuel-sales",
      },
    } as unknown as ActivityValue;
  }

  it("yields matching gas amounts for the same gasoline quantity in m³ and tonnes", () => {
    const volumeM3 = 300_000;
    const tonnes = (volumeM3 * 740) / 1000; // gasoline density

    const inventoryValue = buildInventoryValue();
    const gasValues = buildGasValues();

    const volumeGases = handleActivityAmountTimesEmissionsFactorFormula(
      buildActivityValue(volumeM3, "units-cubic-meters"),
      gasValues,
      inventoryValue,
    );

    const massGases = handleActivityAmountTimesEmissionsFactorFormula(
      buildActivityValue(tonnes, "units-tonnes"),
      gasValues,
      inventoryValue,
    );

    for (const gas of ["CO2", "CH4", "N2O"]) {
      const volumeAmount = volumeGases
        .find((g) => g.gas === gas)!
        .amount.toNumber();
      const massAmount = massGases.find((g) => g.gas === gas)!.amount.toNumber();
      expect(volumeAmount).toBeGreaterThan(0);
      expect(massAmount).toBeGreaterThan(0);
      expect(Math.abs(volumeAmount - massAmount) / volumeAmount).toBeLessThan(
        1e-9,
      );
    }
  });

  it("does not silently return zero when activity is entered in tonnes", () => {
    const gases = handleActivityAmountTimesEmissionsFactorFormula(
      buildActivityValue(222_000, "units-tonnes"),
      buildGasValues(),
      buildInventoryValue(),
    );
    const total = gases.reduce((sum, g) => sum + g.amount.toNumber(), 0);
    expect(total).toBeGreaterThan(0);
  });
});
