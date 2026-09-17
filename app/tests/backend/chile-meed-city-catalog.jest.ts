import { describe, expect, it } from "@jest/globals";
import {
  formatIneCode,
  iso2FromInventoryCountry,
  lookupChileMeedCityByIne,
} from "@/backend/chile-meed-city-catalog";

describe("chile-meed-city-catalog", () => {
  it("maps CHL filenames to CL and pads INE digits", () => {
    expect(iso2FromInventoryCountry("CHL")).toBe("CL");
    expect(formatIneCode("13112", "CL")).toBe("CL13112");
    expect(formatIneCode("CL-13112")).toBe("CL13112");
  });

  it("looks up La Pintana as INE-only and Santiago with UN/LOCODE", () => {
    const pintana = lookupChileMeedCityByIne("CL13112");
    expect(pintana?.name).toBe("La Pintana");
    expect(pintana?.locode).toBeNull();

    const santiago = lookupChileMeedCityByIne("CL13101");
    expect(santiago?.name).toBe("Santiago");
    expect(santiago?.locode).toBe("CL SCL");
  });
});
