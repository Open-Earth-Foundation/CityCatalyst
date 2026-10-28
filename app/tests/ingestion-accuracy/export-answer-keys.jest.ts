import { describe, expect, it } from "@jest/globals";
import { parseNumbers } from "./export-answer-keys";

describe("parseNumbers", () => {
  it("reads European thousands separators", () => {
    expect(parseNumbers("3.505.046; 126.987")).toEqual([3505046, 126987]);
    expect(parseNumbers("Providencia 1.100 (kt)")).toEqual([1100]);
  });

  it("reads European decimals and English separators", () => {
    expect(parseNumbers("33.904,2 kt")).toEqual([33904.2]);
    expect(parseNumbers("TOTAL 3,262,279.10")).toEqual([3262279.1]);
    expect(parseNumbers("2.76 and 6,4")).toEqual([2.76, 6.4]);
  });

  it("keeps plain integers", () => {
    expect(parseNumbers("Pirque 133; 270.707 hab")).toEqual([133, 270707]);
  });
});
