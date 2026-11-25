import { describe, expect, it } from "@jest/globals";
import { formatShareOfTotalEmissions } from "@/util/helpers";

const labels = {
  notAvailableLabel: "N/A",
  lessThanOnePercentLabel: "<1",
  ofTotalEmissionsLabel: "of total emissions",
};

describe("formatShareOfTotalEmissions", () => {
  it("shows N/A when the sector has no percentage (missing data)", () => {
    expect(formatShareOfTotalEmissions({ ...labels })).toBe(
      "N/A % of total emissions",
    );
  });

  it("shows <1% when integer rounding hid a real sub-1% share (CC-1144)", () => {
    expect(
      formatShareOfTotalEmissions({
        ...labels,
        percentage: 0,
        grossCo2eqKg: 63804n,
      }),
    ).toBe("<1% of total emissions");
  });

  it("shows 0% when the sector has no gross emissions", () => {
    expect(
      formatShareOfTotalEmissions({
        ...labels,
        percentage: 0,
        grossCo2eqKg: 0n,
      }),
    ).toBe("0% of total emissions");
  });

  it("shows the rounded whole-number share for 1% and above", () => {
    expect(
      formatShareOfTotalEmissions({
        ...labels,
        percentage: 12,
        grossCo2eqKg: 1_000_000n,
      }),
    ).toBe("12% of total emissions");
  });
});
