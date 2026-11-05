import { describe, expect, it } from "@jest/globals";
import type { TFunction } from "i18next";

import {
  CHANNEL_KEYS,
  enumLabel,
  financeReason,
  INSTRUMENT_KEYS,
  LIFECYCLE_KEYS,
  projectName,
  SECTOR_KEYS,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/finance/labels";

// Echoes the key (and the count) so assertions read the key that was chosen.
const t = ((key: string, opts?: { count?: number }) =>
  opts?.count !== undefined
    ? `${key}:${opts.count}`
    : key) as unknown as TFunction;

describe("finance enum labels", () => {
  it("maps the endpoint vocabulary to label keys, case-insensitively", () => {
    expect(enumLabel(INSTRUMENT_KEYS, "grant", t)).toBe("instrument-grant");
    expect(enumLabel(INSTRUMENT_KEYS, "technical_assistance", t)).toBe(
      "instrument-technical-assistance",
    );
    expect(enumLabel(LIFECYCLE_KEYS, "in-execution", t)).toBe(
      "lifecycle-in-execution",
    );
    expect(enumLabel(CHANNEL_KEYS, "Intermediated Multilateral", t)).toBe(
      "channel-intermediated-multilateral",
    );
    expect(enumLabel(SECTOR_KEYS, "stationary_energy", t)).toBe(
      "sector-stationary-energy",
    );
  });

  it("humanizes a value it has no key for, and dashes an empty one", () => {
    expect(enumLabel(SECTOR_KEYS, "Transport", t)).toBe(
      "sector-transportation",
    );
    expect(enumLabel(SECTOR_KEYS, "Housing and Urban Development", t)).toBe(
      "Housing And Urban Development",
    );
    expect(enumLabel(SECTOR_KEYS, null, t)).toBe("—");
  });
});

describe("projectName", () => {
  const proj = {
    project_name: "Ayun: Renewing Energies",
    project_name_i18n: {
      en: "Ayun: Renewing Energies",
      es: "Ayun Renovando Energías",
    },
  };

  it("prefers the page language, then English, then the raw name", () => {
    expect(projectName(proj, "es", "fallback")).toBe("Ayun Renovando Energías");
    expect(projectName(proj, "de", "fallback")).toBe("Ayun: Renewing Energies");
    expect(projectName({ project_name: "Raw" }, "es", "fallback")).toBe("Raw");
    expect(projectName({}, "es", "fallback")).toBe("fallback");
  });
});

describe("financeReason", () => {
  it("rebuilds the route tagline plus the comparable-project count", () => {
    const row = {
      action_id: "a",
      financial_feasibility: 0.7,
      route: "needs technical assistance",
      reason:
        "Capacity is the constraint, not money; needs technical assistance. 57 comparable project(s) on record.",
      inputs: { evidence: { n_existing_projects: 57 } },
    };
    expect(financeReason(row, t)).toBe(
      "route-technical-assistance-tagline comparable-projects:57",
    );
  });

  it("leaves the count out when there are no comparable projects", () => {
    const row = {
      action_id: "a",
      financial_feasibility: 0.9,
      route: "self-deliverable",
      reason: "Low-capital action the city can deliver itself.",
      inputs: { evidence: { n_existing_projects: 0 } },
    };
    expect(financeReason(row, t)).toBe("route-self-tagline");
  });

  it("keeps the endpoint's own text for a route it does not know", () => {
    const row = {
      action_id: "a",
      financial_feasibility: 0.5,
      route: "something new",
      reason: "A reason the UI has no tagline for.",
    };
    expect(financeReason(row, t)).toBe("A reason the UI has no tagline for.");
  });
});
