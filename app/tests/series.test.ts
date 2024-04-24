import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { estimate } from "@/util/series"

describe("Series", () => {
  let series0 = [
    { year: 2000, value: 100 }
  ];

  let series = [
    { year: 2000, value: 100 },
    { year: 2010, value: 200 },
    { year: 2020, value: 400 }
  ];

  it("should return exact value for small series on match", () => {
    let result = estimate(series0, 2000);
    assert.strictEqual(result, 100);
  })

  it("should return null for small series on no match", () => {
    let result = estimate(series0, 2001);
    assert.strictEqual(result, null);
  })

  it("should return exact value", () => {
    let result = estimate(series, 2010);
    assert.strictEqual(result, 200);
  })

  it("should return interpolated value at low rate", () => {
    let result = estimate(series, 2005);
    assert.strictEqual(result, 150);
  })

  it("should return interpolated value at high rate", () => {
    let result = estimate(series, 2015);
    assert.strictEqual(result, 300);
  })

  it("should return extrapolated value at low rate", () => {
    let result = estimate(series, 1995);
    assert.strictEqual(result, 50);
  })

  it("should return extrapolated value at high rate", () => {
    let result = estimate(series, 2025);
    assert.strictEqual(result, 500);
  })

  it("should return null if below safe extrapolation range", () => {
    let result = estimate(series, 1979);
    assert.strictEqual(result, null);
  })

  it("should return null if above safe extrapolation range", () => {
    let result = estimate(series, 2041);
    assert.strictEqual(result, null);
  })
})