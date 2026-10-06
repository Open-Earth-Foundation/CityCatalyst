/**
 * Unit tests for CC-486 emissions unit display helpers.
 */
import { describe, expect, it } from "@jest/globals";
import {
  convertKgToTonnes,
  formatEmissions,
  resolveEmissionsScale,
} from "@/util/helpers";

describe("emissions unit formatting (CC-486)", () => {
  describe("resolveEmissionsScale", () => {
    it.each([
      [0, "kgCO₂e"],
      [5e-4, "mgCO₂e"],
      [0.5, "gCO₂e"],
      [50, "kgCO₂e"],
      [5_000, "mtCO₂e"],
      [5_000_000, "ktCO₂e"],
      [5e9, "MtCO₂e"],
      [5e12, "GtCO₂e"],
      [5e15, "TtCO₂e"],
    ] as const)("maps %s kg → %s", (kg, unit) => {
      expect(resolveEmissionsScale(kg).unit).toBe(unit);
    });
  });

  describe("formatEmissions", () => {
    it("returns a complete unit label without requiring callers to append CO2e", () => {
      const { value, unit } = formatEmissions(12_500);
      expect(unit).toBe("mtCO₂e");
      expect(value).toMatch(/12/);
    });

    it("uses kgCO₂e below one tonne", () => {
      expect(formatEmissions(250).unit).toBe("kgCO₂e");
    });
  });

  describe("convertKgToTonnes", () => {
    it("formats with product unit labels", () => {
      expect(convertKgToTonnes(12_500)).toBe("12.5 mtCO₂e");
      expect(convertKgToTonnes(250)).toBe("250 kgCO₂e");
      expect(convertKgToTonnes(0)).toBe("0 kgCO₂e");
    });

    it("keeps a space between value and unit for SourceDrawer splits", () => {
      const formatted = convertKgToTonnes(1_500_000);
      expect(formatted.split(" ")).toHaveLength(2);
      expect(formatted.split(" ")[1]).toBe("ktCO₂e");
    });
  });
});
