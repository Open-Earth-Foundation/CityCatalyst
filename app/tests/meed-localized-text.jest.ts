import { describe, expect, it } from "@jest/globals";

import { resolveLocalizedText } from "@/app/[lng]/cities/[cityId]/MEED/localizedText";

describe("resolveLocalizedText", () => {
  const text = { en: "Municipal authority", es: "Competencia municipal" };

  it("returns the requested language", () => {
    expect(resolveLocalizedText(text, "es")).toBe("Competencia municipal");
    expect(resolveLocalizedText(text, "en")).toBe("Municipal authority");
  });

  it("falls back to English when the language is absent", () => {
    expect(resolveLocalizedText(text, "pt")).toBe("Municipal authority");
  });

  it("falls back to any language rather than showing nothing", () => {
    // A justification in the wrong language beats a blank space on screen.
    expect(resolveLocalizedText({ es: "Sólo español" }, "fr")).toBe(
      "Sólo español",
    );
  });

  it("treats blank and missing alike", () => {
    expect(resolveLocalizedText({ en: "   ", es: "Texto" }, "en")).toBe(
      "Texto",
    );
    expect(resolveLocalizedText(null, "en")).toBeNull();
    expect(resolveLocalizedText({}, "en")).toBeNull();
  });
});
