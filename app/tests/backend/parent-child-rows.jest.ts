/**
 * CC-1311: a subsector-level row (`I.3`, no subcategory) is superseded when
 * the same import also has child rows (`I.3.x`) of that subsector.
 */
import { describe, expect, it } from "@jest/globals";
import {
  supersedeParentRows,
  type ResolvedRowRef,
} from "@/backend/import/parent-child-rows";

const parent = (
  index: number,
  co2eq: number | null,
  subsectorId = "s",
  notationKey: string | null = null,
): ResolvedRowRef => ({
  index,
  subsectorId,
  subcategoryId: null,
  co2eq,
  notationKey,
});

const child = (
  index: number,
  co2eq: number | null,
  subsectorId = "s",
  notationKey: string | null = null,
): ResolvedRowRef => ({
  index,
  subsectorId,
  subcategoryId: `c${index}`,
  co2eq,
  notationKey,
});

describe("supersedeParentRows", () => {
  it("no children: parent kept", () => {
    expect(supersedeParentRows([parent(0, 500)])).toEqual([]);
  });

  it("children match: info", () => {
    expect(
      supersedeParentRows([parent(0, 500), child(1, 300), child(2, 200)]),
    ).toEqual([
      {
        index: 0,
        parentValue: 500,
        childrenSum: 500,
        childrenCount: 2,
        gap: 0,
        severity: "info",
      },
    ]);
  });

  it("children short: warning", () => {
    expect(supersedeParentRows([parent(0, 500), child(1, 300)])).toEqual([
      {
        index: 0,
        parentValue: 500,
        childrenSum: 300,
        childrenCount: 1,
        gap: 200,
        severity: "warning",
      },
    ]);
  });

  it("within tolerance: info", () => {
    const [result] = supersedeParentRows([parent(0, 1000), child(1, 995)]);
    expect(result.severity).toBe("info");
    expect(result.gap).toBe(5);
  });

  it("absolute floor of 1 t applies to small parents", () => {
    const [result] = supersedeParentRows([parent(0, 10), child(1, 9.5)]);
    expect(result.severity).toBe("info");
  });

  it("notation-key parent", () => {
    expect(
      supersedeParentRows([parent(0, null, "s", "IE"), child(1, 300)]),
    ).toEqual([
      {
        index: 0,
        parentValue: null,
        childrenSum: 300,
        childrenCount: 1,
        gap: null,
        severity: "info",
      },
    ]);
  });

  it("children all notation keys", () => {
    expect(
      supersedeParentRows([parent(0, 500), child(1, null, "s", "NO")]),
    ).toEqual([
      {
        index: 0,
        parentValue: 500,
        childrenSum: null,
        childrenCount: 1,
        gap: null,
        severity: "info",
      },
    ]);
  });

  it("other subsector untouched", () => {
    expect(supersedeParentRows([parent(0, 500, "s1"), child(1, 300, "s2")]))
      .toEqual([]);
  });

  it("compares converted co2eq as given by the caller", () => {
    // The caller passes co2eq after unit and gas conversion; 0.5 kt = 500 t.
    const [result] = supersedeParentRows([parent(0, 500), child(1, 500)]);
    expect(result.gap).toBe(0);
  });
});
