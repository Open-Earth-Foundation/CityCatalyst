import { describe, expect, it } from "@jest/globals";
import type { TFunction } from "i18next";

import { buildActionIndex } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/actionCatalog";
import {
  computeExclusionMatches,
  toProposedExclusions,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/preflight/exclusionProposals";

/**
 * Fixture rows in the shape the action-pathways catalog returns them, so the
 * index build — and with it the `emissions.sector_number` → tag derivation the
 * matcher depends on — is exercised rather than stubbed.
 */
const CATALOG = {
  actions: [
    {
      actionId: "t1",
      actionName: "Bus rapid transit",
      emissions: { sector_number: "II" },
      coBenefits: { air_quality: { impact_relationship: "positive" } },
    },
    {
      actionId: "t2",
      actionName: "Airport expansion offsets",
      emissions: { sector_number: "II" },
      coBenefits: {
        air_quality: { impact_relationship: "negative", impact_numeric: -1 },
      },
    },
    {
      actionId: "e1",
      actionName: "Waste-to-energy plant",
      emissions: { sector_number: "I" },
      coBenefits: { air_quality: { impact_relationship: "negative" } },
    },
    {
      actionId: "w1",
      actionName: "Landfill gas flaring",
      emissions: { sector_number: "III" },
      // Numeric only — the prioritizer's own negativity test.
      coBenefits: { air_quality: { impact_numeric: -2 } },
    },
    {
      actionId: "a1",
      actionName: "Reforestation",
      // No sector_number; the tag has to come from the GPC reference.
      emissions: { gpc_reference_number: ["V.2"] },
      coBenefits: { housing: { impact_relationship: "not_applicable" } },
    },
    {
      actionId: "x1",
      actionName: "Cross-cutting governance reform",
      emissions: null,
      coBenefits: null,
    },
  ],
};

const index = buildActionIndex(CATALOG);

const ids = (matches: { actionId: string }[]) => matches.map((m) => m.actionId);

describe("MEED exclusion matching", () => {
  it("proposes nothing when no structural criteria are set", () => {
    expect(
      computeExclusionMatches(index, {
        excludedSectors: [],
        excludedCoBenefits: [],
      }),
    ).toEqual([]);
  });

  it("matches actions in an excluded sector", () => {
    const matches = computeExclusionMatches(index, {
      excludedSectors: ["transportation"],
      excludedCoBenefits: [],
    });
    expect(ids(matches)).toEqual(["t1", "t2"]);
    expect(matches[0].matchedSectorTag).toBe("transportation");
  });

  it("derives the sector from the GPC reference when sector_number is absent", () => {
    const matches = computeExclusionMatches(index, {
      excludedSectors: ["afolu"],
      excludedCoBenefits: [],
    });
    expect(ids(matches)).toEqual(["a1"]);
  });

  it("leaves actions with no sector alone", () => {
    const matches = computeExclusionMatches(index, {
      excludedSectors: [
        "stationary_energy",
        "transportation",
        "waste",
        "ippu",
        "afolu",
      ],
      excludedCoBenefits: [],
    });
    expect(ids(matches)).not.toContain("x1");
  });

  it("matches a negative co-benefit by relationship or by sign", () => {
    const matches = computeExclusionMatches(index, {
      excludedSectors: [],
      excludedCoBenefits: ["air_quality"],
    });
    // t1 is positive on air quality and must not be caught.
    expect(ids(matches)).toEqual(["e1", "t2", "w1"]);
  });

  it("does not treat a non-negative relationship as harm", () => {
    const matches = computeExclusionMatches(index, {
      excludedSectors: [],
      excludedCoBenefits: ["housing"],
    });
    expect(matches).toEqual([]);
  });

  it("reports an action caught on both axes once, with both reasons", () => {
    const matches = computeExclusionMatches(index, {
      excludedSectors: ["transportation"],
      excludedCoBenefits: ["air_quality"],
    });
    const both = matches.filter((m) => m.actionId === "t2");
    expect(both).toHaveLength(1);
    expect(both[0].matchedSectorTag).toBe("transportation");
    expect(both[0].matchedCoBenefitKeys).toEqual(["air_quality"]);
  });
});

describe("MEED exclusion proposals", () => {
  // Echoes the key and interpolations, so assertions read as the key that was
  // asked for rather than as English copy this test would have to be kept in
  // step with.
  const t = ((key: string, options?: Record<string, string>) =>
    options
      ? `${key}:${Object.values(options).join(",")}`
      : key) as unknown as TFunction;

  it("carries the catalog name and the server's matchedBy tags", () => {
    const proposals = toProposedExclusions(
      computeExclusionMatches(index, {
        excludedSectors: ["transportation"],
        excludedCoBenefits: ["air_quality"],
      }),
      index,
      t,
    );

    const t2 = proposals.find((p) => p.actionId === "t2");
    expect(t2?.actionName).toBe("Airport expansion offsets");
    expect(t2?.matchedBy).toEqual(["sector", "co_benefit"]);
    expect(t2?.reasons).toEqual([
      "preview-reason-sector:sector-transportation",
      "preview-reason-co-benefit:co-benefit-air-quality",
    ]);
  });

  it("orders proposals by name so re-renders cannot reshuffle the checkboxes", () => {
    const proposals = toProposedExclusions(
      computeExclusionMatches(index, {
        excludedSectors: ["transportation"],
        excludedCoBenefits: [],
      }),
      index,
      t,
    );
    expect(proposals.map((p) => p.actionName)).toEqual([
      "Airport expansion offsets",
      "Bus rapid transit",
    ]);
  });

  it("falls back to the action ID when the catalog has no name", () => {
    const sparse = buildActionIndex({
      actions: [{ actionId: "n1", emissions: { sector_number: "III" } }],
    });
    const proposals = toProposedExclusions(
      computeExclusionMatches(sparse, {
        excludedSectors: ["waste"],
        excludedCoBenefits: [],
      }),
      sparse,
      t,
    );
    expect(proposals[0].actionName).toBe("n1");
  });
});
