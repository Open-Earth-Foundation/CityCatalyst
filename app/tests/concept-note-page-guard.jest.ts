import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const notFoundMock = jest.fn<() => never>(() => {
  throw new Error("not found");
});
const connectionMock = jest.fn<() => Promise<void>>(async () => {});
const hasServerFeatureFlagMock = jest.fn<(flag: string) => boolean>();

jest.unstable_mockModule("next/navigation", () => ({
  notFound: notFoundMock,
}));
jest.unstable_mockModule("next/server", () => ({
  connection: connectionMock,
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

  it("allows the page when both required flags are enabled", async () => {
    hasServerFeatureFlagMock.mockReturnValue(true);

    await expect(requireConceptNoteBuilderPageEnabled()).resolves.toBe(
      undefined,
    );
  });

  it("hides the page when Climate Advisor integration is disabled", async () => {
    hasServerFeatureFlagMock.mockReturnValueOnce(false);

    await expect(requireConceptNoteBuilderPageEnabled()).rejects.toThrow(
      "not found",
    );
  });

  it("hides the page when the Concept Note Builder flag is disabled", async () => {
    hasServerFeatureFlagMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    await expect(requireConceptNoteBuilderPageEnabled()).rejects.toThrow(
      "not found",
    );
  });

  it("reads the flags only after the request starts", async () => {
    // Build-time prerender never resolves connection(), so no flag read may
    // happen before it; otherwise the empty build env bakes in a 404.
    let releaseRequest!: () => void;
    connectionMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseRequest = resolve;
      }),
    );
    hasServerFeatureFlagMock.mockReturnValue(true);

    const guard = requireConceptNoteBuilderPageEnabled();
    expect(hasServerFeatureFlagMock).not.toHaveBeenCalled();

    releaseRequest();
    await guard;
    expect(hasServerFeatureFlagMock).toHaveBeenCalledTimes(2);
  });
});
