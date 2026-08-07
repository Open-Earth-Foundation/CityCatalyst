import { describe, expect, it } from "@jest/globals";

import {
  cdpEmissionsRows,
  findCdpEmissionsRow,
} from "@/util/cdp-emissions-crosswalk";

describe("cdpEmissionsRows crosswalk", () => {
  it("maps Transportation scope 3 to GPC transport II.*.3 codes (CC-662)", () => {
    const row = findCdpEmissionsRow("Transportation – scope 3");
    expect(row).toBeDefined();
    expect(row!.refNos).toEqual(["II.1.3", "II.2.3", "II.3.3", "II.4.3"]);
    expect(row!.refNos.every((ref) => ref.startsWith("II."))).toBe(true);
    expect(
      row!.refNos.some((ref) => /^I\.\d/.test(ref) && !ref.startsWith("II.")),
    ).toBe(false);
  });

  it("keeps Stationary Energy scope 3 on I.*.3 codes", () => {
    const row = findCdpEmissionsRow("Stationary Energy – scope 3");
    expect(row).toBeDefined();
    expect(row!.refNos).toEqual([
      "I.1.3",
      "I.2.3",
      "I.3.3",
      "I.4.3",
      "I.5.3",
      "I.6.3",
    ]);
  });

  it("includes transport scope 3 refs inside Total scope 3", () => {
    const total = findCdpEmissionsRow("Total scope 3 emissions");
    expect(total).toBeDefined();
    for (const ref of ["II.1.3", "II.2.3", "II.3.3", "II.4.3"]) {
      expect(total!.refNos).toContain(ref);
    }
  });

  it("exports every expected category regex", () => {
    const patterns = cdpEmissionsRows.map((row) => row.rowRegex.source);
    expect(patterns).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Transportation.*scope 3"),
        expect.stringContaining("Stationary Energy.*scope 3"),
      ]),
    );
  });
});
