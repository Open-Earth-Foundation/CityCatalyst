import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const notFound = jest.fn((): never => {
  throw new Error("not found");
});
const connection = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const hasServerFeatureFlag = jest.fn<(flag: string) => boolean>();

jest.unstable_mockModule("next/navigation", () => ({ notFound }));
jest.unstable_mockModule("next/server", () => ({ connection }));
jest.unstable_mockModule("@/util/feature-flags", () => ({
  FeatureFlags: {
    CA_SERVICE_INTEGRATION: "CA_SERVICE_INTEGRATION",
    STATIONARY_ENERGY_AGENTIC: "STATIONARY_ENERGY_AGENTIC",
  },
  hasServerFeatureFlag,
}));

const { requireStationaryEnergyAgenticPageEnabled } =
  await import("@/backend/agentic/ghgi/stationary-energy/page-guard");

describe("Stationary Energy draft page guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("waits for a request before reading the feature flags", async () => {
    let startRequest!: () => void;
    connection.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        startRequest = resolve;
      }),
    );
    hasServerFeatureFlag.mockReturnValue(true);

    const guard = requireStationaryEnergyAgenticPageEnabled();
    expect(hasServerFeatureFlag).not.toHaveBeenCalled();

    startRequest();
    await guard;
    expect(hasServerFeatureFlag).toHaveBeenCalledWith("CA_SERVICE_INTEGRATION");
    expect(hasServerFeatureFlag).toHaveBeenCalledWith(
      "STATIONARY_ENERGY_AGENTIC",
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each(["CA_SERVICE_INTEGRATION", "STATIONARY_ENERGY_AGENTIC"])(
    "shows a 404 when %s is disabled",
    async (disabledFlag) => {
      hasServerFeatureFlag.mockImplementation((flag) => flag !== disabledFlag);

      await expect(requireStationaryEnergyAgenticPageEnabled()).rejects.toThrow(
        "not found",
      );
    },
  );
});
