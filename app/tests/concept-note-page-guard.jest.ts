import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const notFoundMock = jest.fn<() => never>(() => {
  throw new Error("not found");
});
const hasServerFeatureFlagMock = jest.fn<(flag: string) => boolean>();

jest.unstable_mockModule("next/navigation", () => ({
  notFound: notFoundMock,
}));
jest.unstable_mockModule("@/util/feature-flags", () => ({
  FeatureFlags: {
    CA_SERVICE_INTEGRATION: "CA_SERVICE_INTEGRATION",
    CONCEPT_NOTE_BUILDER: "CONCEPT_NOTE_BUILDER",
  },
  hasServerFeatureFlag: hasServerFeatureFlagMock,
}));

const { requireConceptNoteBuilderPageEnabled } =
  await import("@/backend/concept-note-page-guard");

describe("Concept Note Builder page guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows the page when both required flags are enabled", () => {
    hasServerFeatureFlagMock.mockReturnValue(true);

    expect(() => requireConceptNoteBuilderPageEnabled()).not.toThrow();
  });

  it("hides the page when Climate Advisor integration is disabled", () => {
    hasServerFeatureFlagMock.mockReturnValueOnce(false);

    expect(() => requireConceptNoteBuilderPageEnabled()).toThrow("not found");
  });

  it("hides the page when the Concept Note Builder flag is disabled", () => {
    hasServerFeatureFlagMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    expect(() => requireConceptNoteBuilderPageEnabled()).toThrow("not found");
  });
});
