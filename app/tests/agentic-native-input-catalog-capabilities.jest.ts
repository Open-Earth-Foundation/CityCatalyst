import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import createHttpError from "http-errors";

import type { AppSession } from "@/lib/auth";
import { Auth } from "@/lib/auth";
import { Roles } from "@/util/types";
import { expectStatusCode, mockRequest, setupTests } from "./helpers";

const discoverNativeInputs = jest.fn();
const readNativeInputCapability = jest.fn();
const hasServerFeatureFlag = jest.fn();
const hasFeatureFlag = jest.fn();

jest.unstable_mockModule(
  "@/backend/NativeInputCatalogCapabilityService",
  () => ({
    discoverNativeInputs,
    readNativeInputCapability,
  }),
);
jest.unstable_mockModule("@/util/feature-flags", () => ({
  FeatureFlags: {
    CA_SERVICE_INTEGRATION: "CA_SERVICE_INTEGRATION",
  },
  hasFeatureFlag,
  hasServerFeatureFlag,
}));

let discoverRoute: typeof import("@/app/api/v1/internal/ca/capabilities/native-inputs/discover/route").POST;
let readRoute: typeof import("@/app/api/v1/internal/ca/capabilities/native-inputs/read/route").POST;

const userId = "11111111-1111-4111-8111-111111111111";
const cityId = "22222222-2222-4222-8222-222222222222";
const serviceKey = "test-cc-service-key";
const session: AppSession = {
  user: { id: userId, role: Roles.User },
  expires: "1h",
};

beforeAll(async () => {
  ({ POST: discoverRoute } =
    await import("@/app/api/v1/internal/ca/capabilities/native-inputs/discover/route"));
  ({ POST: readRoute } =
    await import("@/app/api/v1/internal/ca/capabilities/native-inputs/read/route"));
});

describe("internal CA NativeInputCatalog discovery route", () => {
  beforeEach(() => {
    setupTests();
    process.env.CC_SERVICE_API_KEY = serviceKey;
    hasServerFeatureFlag.mockReturnValue(true);
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(session);
    discoverNativeInputs.mockReset();
    readNativeInputCapability.mockReset();
    discoverNativeInputs.mockResolvedValue([
      {
        catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "inventory_import",
        owning_module: "ghgi",
        source_type: "inventory",
        capability_ids: ["ghgi.inventory.status_overview"],
      },
    ]);
    readNativeInputCapability.mockResolvedValue({
      action: "ghgi.inventory.status_overview",
      success: true,
      data: { inventory_name: "Downtown inventory", status: "ready" },
    });
  });

  it("returns the Core safe discovery envelope", async () => {
    const response = await discoverRoute(
      mockRequest({ user_id: userId, city_id: cityId }, undefined, {
        "X-Service-Name": "climate-advisor",
        "X-Service-Key": serviceKey,
      }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 200);
    await expect(response.json()).resolves.toEqual({
      action: "native_input.discover",
      success: true,
      data: {
        entries: [
          {
            catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            kind: "inventory_import",
            owning_module: "ghgi",
            source_type: "inventory",
            capability_ids: ["ghgi.inventory.status_overview"],
          },
        ],
      },
    });
    expect(discoverNativeInputs).toHaveBeenCalledWith(
      { userId, cityId },
      session,
    );
  });

  it("requires the Climate Advisor service contract", async () => {
    const response = await discoverRoute(
      mockRequest({ user_id: userId }, undefined, {}),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 401);
    expect(discoverNativeInputs).not.toHaveBeenCalled();
  });

  it("requires a bearer-bound session even when the body omits user_id", async () => {
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(null);

    const response = await discoverRoute(
      mockRequest({}, undefined, {
        "X-Service-Name": "climate-advisor",
        "X-Service-Key": serviceKey,
      }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 401);
    expect(discoverNativeInputs).not.toHaveBeenCalled();
  });

  it("rejects a body user that does not match the bearer session", async () => {
    const response = await discoverRoute(
      mockRequest(
        { user_id: "33333333-3333-4333-8333-333333333333" },
        undefined,
        {
          "X-Service-Name": "climate-advisor",
          "X-Service-Key": serviceKey,
        },
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 403);
    expect(discoverNativeInputs).not.toHaveBeenCalled();
  });

  it("rejects malformed discovery filters before calling Core", async () => {
    const response = await discoverRoute(
      mockRequest({ city_id: "not-a-uuid" }, undefined, {
        "X-Service-Name": "climate-advisor",
        "X-Service-Key": serviceKey,
      }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 400);
    expect(discoverNativeInputs).not.toHaveBeenCalled();
  });

  it("returns not found when the integration feature is disabled", async () => {
    hasServerFeatureFlag.mockReturnValue(false);

    const response = await discoverRoute(
      mockRequest({ user_id: userId }, undefined, {
        "X-Service-Name": "climate-advisor",
        "X-Service-Key": serviceKey,
      }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 404);
    expect(discoverNativeInputs).not.toHaveBeenCalled();
  });

  it("returns the Core bounded selected-read envelope", async () => {
    const catalogId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const response = await readRoute(
      mockRequest(
        {
          catalog_id: catalogId,
          capability_id: "ghgi.inventory.status_overview",
          user_id: userId,
          city_id: cityId,
          input: { include_summary: true },
        },
        undefined,
        {
          "X-Service-Name": "climate-advisor",
          "X-Service-Key": serviceKey,
        },
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 200);
    await expect(response.json()).resolves.toEqual({
      action: "ghgi.inventory.status_overview",
      success: true,
      data: { inventory_name: "Downtown inventory", status: "ready" },
    });
    expect(readNativeInputCapability).toHaveBeenCalledWith(
      {
        catalogId,
        capabilityId: "ghgi.inventory.status_overview",
        userId,
        cityId,
        input: { include_summary: true },
      },
      session,
    );
  });

  it("requires the Climate Advisor service contract for selected reads", async () => {
    const response = await readRoute(
      mockRequest(
        {
          catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          capability_id: "ghgi.inventory.status_overview",
          input: {},
        },
        undefined,
        {},
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 401);
    expect(readNativeInputCapability).not.toHaveBeenCalled();
  });

  it("rejects malformed selected-read input before calling Core", async () => {
    const response = await readRoute(
      mockRequest(
        {
          catalog_id: "not-a-uuid",
          capability_id: "",
          input: [],
        },
        undefined,
        {
          "X-Service-Name": "climate-advisor",
          "X-Service-Key": serviceKey,
        },
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 400);
    expect(readNativeInputCapability).not.toHaveBeenCalled();
  });

  it("rejects a selected-read body user that does not match the bearer session", async () => {
    const response = await readRoute(
      mockRequest(
        {
          catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          capability_id: "ghgi.inventory.status_overview",
          user_id: "33333333-3333-4333-8333-333333333333",
          input: {},
        },
        undefined,
        {
          "X-Service-Name": "climate-advisor",
          "X-Service-Key": serviceKey,
        },
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 403);
    expect(readNativeInputCapability).not.toHaveBeenCalled();
  });

  it("preserves the stable non-disclosing unavailable-selection error", async () => {
    const unavailable = new createHttpError.NotFound(
      "Requested capability is unavailable.",
    ) as createHttpError.HttpError & { code?: string };
    unavailable.code = "capability_unavailable";
    readNativeInputCapability.mockRejectedValueOnce(unavailable);

    const response = await readRoute(
      mockRequest(
        {
          catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          capability_id: "ghgi.inventory.status_overview",
          input: {},
        },
        undefined,
        {
          "X-Service-Name": "climate-advisor",
          "X-Service-Key": serviceKey,
        },
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 404);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Requested capability is unavailable.",
        code: "capability_unavailable",
      },
    });
  });

  it("returns not found when the selected-read integration feature is disabled", async () => {
    hasServerFeatureFlag.mockReturnValue(false);

    const response = await readRoute(
      mockRequest(
        {
          catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          capability_id: "ghgi.inventory.status_overview",
          input: {},
        },
        undefined,
        {
          "X-Service-Name": "climate-advisor",
          "X-Service-Key": serviceKey,
        },
      ),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(response, 404);
    expect(readNativeInputCapability).not.toHaveBeenCalled();
  });
});
