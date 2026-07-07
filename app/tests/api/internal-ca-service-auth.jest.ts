import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

import { POST as postAllowedCapabilities } from "@/app/api/v1/internal/ca/capabilities/allowed-capabilities/route";
import { POST as postUserToken } from "@/app/api/v1/internal/ca/user-token/route";
import {
  COMMIT_ACCEPTED_CAPABILITY,
  LOAD_CONTEXT_CAPABILITY,
} from "@/backend/agentic/ghgi/stationary-energy/registry";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { Roles } from "@/util/types";

const mockBuildStationaryEnergyContext = jest.fn<() => Promise<unknown>>();
const mockCommitAcceptedStationaryEnergyRows =
  jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule(
  "@/backend/agentic/ghgi/stationary-energy/context",
  () => ({
    buildStationaryEnergyContext: mockBuildStationaryEnergyContext,
  }),
);
jest.unstable_mockModule(
  "@/backend/agentic/ghgi/stationary-energy/commit",
  () => ({
    commitAcceptedStationaryEnergyRows: mockCommitAcceptedStationaryEnergyRows,
  }),
);

let postLoadContext: typeof import("@/app/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context/route").POST;
let postCommitAccepted: typeof import("@/app/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted/route").POST;

beforeAll(async () => {
  ({ POST: postLoadContext } = await import(
    "@/app/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context/route"
  ));
  ({ POST: postCommitAccepted } = await import(
    "@/app/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted/route"
  ));
});

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CITY_ID = "33333333-3333-4333-8333-333333333333";
const INVENTORY_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_INVENTORY_ID = "55555555-5555-4555-8555-555555555555";
const DRAFT_RUN_ID = "66666666-6666-4666-8666-666666666666";
const PROPOSAL_ID = "77777777-7777-4777-8777-777777777777";
const SELECTED_SOURCE_ID = "88888888-8888-4888-8888-888888888888";

function makeRequest(
  pathName: string,
  body: unknown,
  headers?: HeadersInit,
): NextRequest {
  const request = new NextRequest(new URL(`http://localhost:3000${pathName}`), {
    headers,
    method: "POST",
  });
  request.json = jest.fn(async () => body) as unknown as typeof request.json;
  return request;
}

function jsonHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  return headers;
}

function serviceToken(
  userId: string | undefined,
  overrides: {
    audience?: string;
    issuer?: string;
    issuedBy?: string;
    expiresIn?: SignOptions["expiresIn"];
  } = {},
): string {
  const payload: Record<string, unknown> = {
    role: Roles.User,
    issued_by: overrides.issuedBy ?? "climate-advisor-service",
  };
  if (userId !== undefined) {
    payload.sub = userId;
  }
  const options: SignOptions = {
    audience: overrides.audience ?? process.env.HOST,
    expiresIn: overrides.expiresIn ?? "1h",
    issuer: overrides.issuer ?? "climate-advisor-service",
  };
  return jwt.sign(payload, process.env.VERIFICATION_TOKEN_SECRET!, options);
}

function serviceHeaders(token: string, extra?: HeadersInit): Headers {
  return jsonHeaders({
    Authorization: `Bearer ${token}`,
    "X-Service-Name": "climate-advisor",
    "X-Service-Key": "ci-shared-service-key",
    ...Object.fromEntries(new Headers(extra)),
  });
}

function allowedBody(
  userId = USER_ID,
  inventoryId = INVENTORY_ID,
): Record<string, string> {
  return {
    city_id: CITY_ID,
    inventory_id: inventoryId,
    sector_code: "stationary_energy",
    user_id: userId,
    workflow_step: "draft",
  };
}

function loadContextBody(userId = USER_ID): Record<string, string> {
  return {
    city_id: CITY_ID,
    inventory_id: INVENTORY_ID,
    sector_code: "stationary_energy",
    user_id: userId,
  };
}

function commitAcceptedBody(userId = USER_ID): Record<string, unknown> {
  return {
    city_id: CITY_ID,
    draft_run_id: DRAFT_RUN_ID,
    inventory_id: INVENTORY_ID,
    rows: [
      {
        decision_version: 1,
        proposal_id: PROPOSAL_ID,
        row_type: "selected_source",
        selected_source_id: SELECTED_SOURCE_ID,
        target_ref: { subsector_id: "I.1" },
      },
    ],
    user_id: userId,
  };
}

async function expectJsonStatus(
  response: Response,
  status: number,
): Promise<unknown> {
  expect(response.status).toBe(status);
  return response.json();
}

describe("internal CA service auth contract", () => {
  const originalDbInitialized = db.initialized;
  const originalFeatureFlags = process.env.NEXT_PUBLIC_FEATURE_FLAGS;
  const originalServiceKey = process.env.CC_SERVICE_API_KEY;
  const originalVerificationSecret = process.env.VERIFICATION_TOKEN_SECRET;
  const originalHost = process.env.HOST;

  beforeEach(() => {
    db.initialized = true;
    process.env.CC_SERVICE_API_KEY = "ci-shared-service-key";
    process.env.HOST = "http://localhost:3000";
    process.env.NEXT_PUBLIC_FEATURE_FLAGS =
      "CA_SERVICE_INTEGRATION,STATIONARY_ENERGY_AGENTIC";
    process.env.VERIFICATION_TOKEN_SECRET = "ci-jwt-secret";

    jest.spyOn(db.models.User, "findByPk").mockImplementation(
      async (userId) =>
        ({
          email: `${String(userId)}@example.test`,
          name: `User ${String(userId)}`,
          pictureUrl: null,
          role: Roles.User,
          userId,
        }) as any,
    );
    jest.spyOn(db.models.User, "findOne").mockImplementation(
      async (options: any) =>
        ({
          email: `${String(options?.where?.userId)}@example.test`,
          name: `User ${String(options?.where?.userId)}`,
          pictureUrl: null,
          role: Roles.User,
          userId: options?.where?.userId,
        }) as any,
    );
    jest.spyOn(PermissionService, "canEditInventory").mockResolvedValue({
      resource: { cityId: CITY_ID },
    } as any);
    mockBuildStationaryEnergyContext.mockResolvedValue({
      city: {},
      current_values: [],
      guidance_context: {},
      inventory: {},
      permission_summary: {},
      source_candidates: [],
      taxonomy: [],
    });
    mockCommitAcceptedStationaryEnergyRows.mockResolvedValue([
      { proposal_id: PROPOSAL_ID, status: "committed" },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockBuildStationaryEnergyContext.mockReset();
    mockCommitAcceptedStationaryEnergyRows.mockReset();
  });

  afterAll(() => {
    db.initialized = originalDbInitialized;
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = originalFeatureFlags;
    process.env.CC_SERVICE_API_KEY = originalServiceKey;
    process.env.VERIFICATION_TOKEN_SECRET = originalVerificationSecret;
    process.env.HOST = originalHost;
  });

  it("rejects missing and wrong X-CA-Service-Key on the token route", async () => {
    const missingResponse = await postUserToken(
      makeRequest("/api/v1/internal/ca/user-token", {
        inventory_id: INVENTORY_ID,
        user_id: USER_ID,
      }),
    );
    const wrongResponse = await postUserToken(
      makeRequest(
        "/api/v1/internal/ca/user-token",
        {
          inventory_id: INVENTORY_ID,
          user_id: USER_ID,
        },
        { "X-CA-Service-Key": "wrong" },
      ),
    );

    expect(missingResponse.status).toBe(401);
    expect(wrongResponse.status).toBe(401);
  });

  it("rejects token exchange for nonexistent users", async () => {
    (
      db.models.User.findByPk as jest.MockedFunction<
        typeof db.models.User.findByPk
      >
    ).mockResolvedValueOnce(null as any);

    const response = await postUserToken(
      makeRequest(
        "/api/v1/internal/ca/user-token",
        {
          inventory_id: INVENTORY_ID,
          user_id: USER_ID,
        },
        { "X-CA-Service-Key": "ci-shared-service-key" },
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
  });

  it("issues a deployment-compatible user-scoped JWT without inventory claims", async () => {
    const response = await postUserToken(
      makeRequest(
        "/api/v1/internal/ca/user-token",
        {
          inventory_id: INVENTORY_ID,
          user_id: USER_ID,
        },
        { "X-CA-Service-Key": "ci-shared-service-key" },
      ),
    );

    const payload = (await expectJsonStatus(response, 200)) as {
      access_token: string;
    };
    const decoded = jwt.verify(
      payload.access_token,
      process.env.VERIFICATION_TOKEN_SECRET!,
    ) as jwt.JwtPayload;
    expect(decoded.sub).toBe(USER_ID);
    expect(decoded.aud).toBe(process.env.HOST);
    expect(decoded.iss).toBe("climate-advisor-service");
    expect(decoded.issued_by).toBe("climate-advisor-service");
    expect(decoded.inventory_id).toBeUndefined();
  });

  it("rejects malformed and signed-but-wrong service JWTs", async () => {
    const cases = [
      {
        expectedStatus: 401,
        token: "not-a-real-jwt",
      },
      {
        expectedStatus: 401,
        token: serviceToken(USER_ID, { audience: "https://wrong.example" }),
      },
      {
        expectedStatus: 401,
        token: serviceToken(USER_ID, {
          issuedBy: "wrong-service",
          issuer: "wrong-service",
        }),
      },
      {
        expectedStatus: 401,
        token: serviceToken(undefined),
      },
      {
        bodyUserId: OTHER_USER_ID,
        expectedStatus: 403,
        token: serviceToken(USER_ID),
      },
    ];

    for (const testCase of cases) {
      const response = await postAllowedCapabilities(
        makeRequest(
          "/api/v1/internal/ca/capabilities/allowed-capabilities",
          allowedBody(testCase.bodyUserId ?? USER_ID),
          serviceHeaders(testCase.token),
        ),
        { params: Promise.resolve({}) },
      );
      expect(response.status).toBe(testCase.expectedStatus);
    }
  });

  it("accepts a valid token and rejects inaccessible inventory at capability check time", async () => {
    const tokenResponse = await postUserToken(
      makeRequest(
        "/api/v1/internal/ca/user-token",
        {
          inventory_id: OTHER_INVENTORY_ID,
          user_id: USER_ID,
        },
        { "X-CA-Service-Key": "ci-shared-service-key" },
      ),
    );
    const payload = (await expectJsonStatus(tokenResponse, 200)) as {
      access_token: string;
    };

    const validResponse = await postAllowedCapabilities(
      makeRequest(
        "/api/v1/internal/ca/capabilities/allowed-capabilities",
        allowedBody(),
        serviceHeaders(payload.access_token),
      ),
      { params: Promise.resolve({}) },
    );
    await expectJsonStatus(validResponse, 200);

    jest
      .spyOn(PermissionService, "canEditInventory")
      .mockRejectedValueOnce(
        new createHttpError.Forbidden("No inventory access"),
      );
    const inaccessibleResponse = await postAllowedCapabilities(
      makeRequest(
        "/api/v1/internal/ca/capabilities/allowed-capabilities",
        allowedBody(USER_ID, OTHER_INVENTORY_ID),
        serviceHeaders(payload.access_token),
      ),
      { params: Promise.resolve({}) },
    );
    expect(inaccessibleResponse.status).toBe(403);
  });

  it("applies subject-binding checks to Stationary Energy internal routes", async () => {
    const token = serviceToken(USER_ID);
    const loadMismatch = await postLoadContext(
      makeRequest(
        "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context",
        loadContextBody(OTHER_USER_ID),
        serviceHeaders(token),
      ),
      { params: Promise.resolve({}) },
    );
    const commitMismatch = await postCommitAccepted(
      makeRequest(
        "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted",
        commitAcceptedBody(OTHER_USER_ID),
        serviceHeaders(token),
      ),
      { params: Promise.resolve({}) },
    );

    expect(loadMismatch.status).toBe(403);
    expect(commitMismatch.status).toBe(403);

    const loadValid = await postLoadContext(
      makeRequest(
        "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context",
        loadContextBody(USER_ID),
        serviceHeaders(token),
      ),
      { params: Promise.resolve({}) },
    );
    const commitValid = await postCommitAccepted(
      makeRequest(
        "/api/v1/internal/ca/capabilities/ghgi/stationary-energy/commit-accepted",
        commitAcceptedBody(USER_ID),
        serviceHeaders(token),
      ),
      { params: Promise.resolve({}) },
    );

    await expectJsonStatus(loadValid, 200);
    const commitPayload = (await expectJsonStatus(commitValid, 200)) as {
      results: Array<{ status: string }>;
    };
    expect(commitPayload.results[0].status).toBe("committed");
  });

  it("keeps every internal CA route that requires request users in the auth matrix", () => {
    const routesRoot = path.join(
      process.cwd(),
      "src/app/api/v1/internal/ca/capabilities",
    );
    const coveredRoutes = new Set([
      "allowed-capabilities",
      "ghgi/stationary-energy/commit-accepted",
      "ghgi/stationary-energy/load-context",
    ]);
    const optionalRoutesFromUncommittedFeatureWork = new Set([
      "ghgi/stationary-energy/commit-notation-keys",
      "ghgi/stationary-energy/list-notation-keys",
    ]);

    function collectRouteFiles(directory: string): string[] {
      return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
          const entryPath = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            return collectRouteFiles(entryPath);
          }
          return entry.name === "route.ts" ? [entryPath] : [];
        });
    }

    const requestUserRoutes = collectRouteFiles(routesRoot)
      .filter((routeFile) =>
        fs.readFileSync(routeFile, "utf-8").includes("requireRequestUser"),
      )
      .map((routeFile) =>
        path
          .relative(routesRoot, path.dirname(routeFile))
          .replaceAll(path.sep, "/"),
      );

    for (const route of coveredRoutes) {
      expect(requestUserRoutes).toContain(route);
    }
    expect(
      requestUserRoutes.filter(
        (route) =>
          !coveredRoutes.has(route) &&
          !optionalRoutesFromUncommittedFeatureWork.has(route),
      ),
    ).toEqual([]);
  });
});
