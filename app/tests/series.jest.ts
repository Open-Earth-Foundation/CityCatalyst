import { estimate } from "@/util/series";
import { describe, it, expect } from "@jest/globals";

describe("Series", () => {
  const series0 = [{ year: 2000, value: 100 }];

  const series = [
    { year: 2000, value: 100 },
    { year: 2010, value: 200 },
    { year: 2020, value: 400 },
  ];

  it("should return exact value for small series on match", () => {
    const result = estimate(series0, 2000);
    expect(result).toBe(100);
  });

  it("should return null for small series on no match", () => {
    const result = estimate(series0, 2001);
    expect(result).toBeNull();
  });

  it("should return exact value", () => {
    const result = estimate(series, 2010);
    expect(result).toBe(200);
  });

  it("should return interpolated value at low rate", () => {
    const result = estimate(series, 2005);
    expect(result).toBe(150);
  });

  it("should return interpolated value at high rate", () => {
    const result = estimate(series, 2015);
    expect(result).toBe(300);
  });

  it("should return extrapolated value at low rate", () => {
    const result = estimate(series, 1995);
    expect(result).toBe(50);
  });

  it("should return extrapolated value at high rate", () => {
    const result = estimate(series, 2025);
    expect(result).toBe(500);
  });

  it("should return null if below safe extrapolation range", () => {
    const result = estimate(series, 1979);
    expect(result).toBeNull();
  });

  it("should return null if above safe extrapolation range", () => {
    const result = estimate(series, 2041);
    expect(result).toBeNull();
  });
});
