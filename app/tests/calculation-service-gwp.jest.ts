import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Decimal } from "decimal.js";

import CalculationService, {
  DEFAULT_GWP_VERSION,
} from "@/backend/CalculationService";
import { db } from "@/models";
import type { GasToCO2Eq } from "@/models/GasToCO2Eq";
import { GlobalWarmingPotentialTypeEnum } from "@/util/enums";

describe("CalculationService GWP version", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("defaults unknown / missing GWP to ar5", () => {
    expect(CalculationService.resolveGwpVersion(null)).toBe(
      DEFAULT_GWP_VERSION,
    );
    expect(CalculationService.resolveGwpVersion(undefined)).toBe(
      GlobalWarmingPotentialTypeEnum.ar5,
    );
    expect(CalculationService.resolveGwpVersion("nope")).toBe(
      GlobalWarmingPotentialTypeEnum.ar5,
    );
  });

  it("applies AR5 vs AR6 factors when converting the same gas amounts", async () => {
    const findAllSpy = jest.spyOn(db.models.GasToCO2Eq, "findAll");

    findAllSpy.mockImplementation(async (options: any) => {
      const version = options?.where?.gwpVersion;
      if (version === GlobalWarmingPotentialTypeEnum.ar6) {
        return [
          {
            gas: "CH4",
            gwpVersion: GlobalWarmingPotentialTypeEnum.ar6,
            co2eqPerKg: 27.9,
            co2eqYears: 100,
          },
        ] as GasToCO2Eq[];
      }
      return [
        {
          gas: "CH4",
          gwpVersion: GlobalWarmingPotentialTypeEnum.ar5,
          co2eqPerKg: 28,
          co2eqYears: 100,
        },
      ] as GasToCO2Eq[];
    });

    const gases = [{ gas: "CH4", amount: new Decimal(10) }];

    const ar5 = await CalculationService.calculateCO2eqForGases(
      gases,
      GlobalWarmingPotentialTypeEnum.ar5,
    );
    const ar6 = await CalculationService.calculateCO2eqForGases(
      gases,
      GlobalWarmingPotentialTypeEnum.ar6,
    );

    expect(ar5.totalCO2e.toNumber()).toBe(280);
    expect(ar6.totalCO2e.toNumber()).toBe(279);
    expect(findAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gwpVersion: GlobalWarmingPotentialTypeEnum.ar5 },
      }),
    );
    expect(findAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gwpVersion: GlobalWarmingPotentialTypeEnum.ar6 },
      }),
    );
  });
});
