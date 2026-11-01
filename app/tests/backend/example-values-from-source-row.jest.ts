import { describe, expect, it } from "@jest/globals";
import {
  exampleValuesFromSingleRow,
  pickExampleSourceRowIndex,
} from "@/util/example-values-from-source-row";

describe("exampleValuesFromSingleRow", () => {
  const headers = ["gpc", "total", "fuel"];
  const rows = [
    { gpc: "I.1.1", total: null, fuel: "" },
    { gpc: "I.1.2", total: 12, fuel: "diesel" },
    { gpc: "I.1.3", total: 8, fuel: null },
  ];

  it("picks the earliest row with the most filled cells", () => {
    expect(pickExampleSourceRowIndex(rows, headers)).toBe(1);
  });

  it("uses that one row for every column example", () => {
    expect(exampleValuesFromSingleRow(headers, rows)).toEqual({
      exampleRowIndex: 1,
      values: {
        gpc: "I.1.2",
        total: "12",
        fuel: "diesel",
      },
    });
  });
});
