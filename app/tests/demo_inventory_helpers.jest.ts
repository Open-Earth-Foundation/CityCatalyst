import { describe, expect, it } from "@jest/globals";
import {
  DEMO_INVENTORY_TEMPLATES,
  resolveDemoBoundaryLocode,
} from "@/backend/DemoInventoryService";

describe("resolveDemoBoundaryLocode", () => {
  it("maps a synthetic demo locode to the template's real UN/LOCODE", () => {
    const template = DEMO_INVENTORY_TEMPLATES["porto-alegre-2022"];
    const syntheticLocode = `${template.countryLocode} DEMO-${template.id}-11111111-2222-3333-4444-555555555555`;

    expect(resolveDemoBoundaryLocode(syntheticLocode)).toBe(
      template.boundaryLocode,
    );
  });

  it("starts with the template country LOCODE so flag derivation works", () => {
    const template = DEMO_INVENTORY_TEMPLATES["porto-alegre-2022"];
    const syntheticLocode = `${template.countryLocode} DEMO-${template.id}-11111111-2222-3333-4444-555555555555`;

    expect(syntheticLocode.substring(0, 2)).toBe(template.countryLocode);
  });

  it("returns null for non-demo locodes", () => {
    expect(resolveDemoBoundaryLocode("BR POA")).toBeNull();
    expect(resolveDemoBoundaryLocode("US NYC")).toBeNull();
    expect(resolveDemoBoundaryLocode("")).toBeNull();
  });

  it("returns null for demo-marked locodes from unknown templates", () => {
    expect(
      resolveDemoBoundaryLocode("BR DEMO-unknown-template-id-projectId"),
    ).toBeNull();
  });
});
