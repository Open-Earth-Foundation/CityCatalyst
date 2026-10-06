import { describe, expect, it } from "@jest/globals";

import {
  countSectorsWithData,
  emissionsRetrievedState,
  hasEmissionsData,
} from "@/app/[lng]/cities/[cityId]/MEED/meedEmissions";
import { statusOf } from "@/app/[lng]/cities/[cityId]/MEED/meedStatus";

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as never;

const withData = {
  totalEmissions: {
    bySector: [
      { sectorName: "stationary-energy", co2eq: 174_600_000n },
      { sectorName: "transportation", co2eq: "227600000" },
      { sectorName: "waste", co2eq: 0 },
    ],
  },
};

describe("emissions retrieval state", () => {
  it("counts only sectors with emissions above zero", () => {
    expect(countSectorsWithData(withData)).toBe(2);
    expect(hasEmissionsData(withData)).toBe(true);
  });

  it("marks a retrieval with data as complete", () => {
    const state = emissionsRetrievedState(withData, t);
    expect(state.progress).toBe(100);
    expect(state.confirmed).toBe(true);
    expect(statusOf(state)).toBe("complete");
    expect(state.sub).toContain('"n":2');
  });

  it("records an empty inventory as visited but never complete", () => {
    const state = emissionsRetrievedState(
      { totalEmissions: { bySector: [] } },
      t,
    );
    expect(state.visited).toBe(true);
    expect(state.progress).toBe(0);
    expect(state.confirmed).toBe(false);
    expect(statusOf(state)).toBe("in-progress");
    expect(state.sub).toBe("emissions-none-sub");
  });
});
