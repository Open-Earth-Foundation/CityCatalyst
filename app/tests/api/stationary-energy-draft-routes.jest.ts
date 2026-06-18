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
import { NextRequest } from "next/server";

import { GET as getDraftStatus } from "@/app/api/v1/stationary-energy-drafts/[draftRunId]/route";
import { POST as saveDraft } from "@/app/api/v1/stationary-energy-drafts/[draftRunId]/save/route";
import { POST as startDraft } from "@/app/api/v1/stationary-energy-drafts/start/route";
import { Auth, type AppSession } from "@/lib/auth";
import { db } from "@/models";
import { Roles } from "@/util/types";

const TEST_USER_ID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const TEST_CITY_ID = "11111111-1111-4111-8111-111111111111";
const TEST_INVENTORY_ID = "22222222-2222-4222-8222-222222222222";
const TEST_DRAFT_RUN_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Build a JSON request for route tests and allow custom json() behavior.
 */
function makeRequest(
  url: string,
  method: "GET" | "POST",
  body?: unknown,
  jsonImpl?: () => Promise<unknown>,
): NextRequest {
  const request = new NextRequest(new URL(url), { method });
  if (jsonImpl) {
    request.json = jest.fn(jsonImpl) as unknown as typeof request.json;
  } else if (body !== undefined) {
    request.json = jest.fn(async () => body) as unknown as typeof request.json;
  }
  return request;
}

/**
 * Create a JSON response for mocked upstream fetch calls.
 */
function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

describe("Stationary Energy draft routes", () => {
  const originalFetch = global.fetch;
  const originalFeatureFlags = process.env.NEXT_PUBLIC_FEATURE_FLAGS;
  const originalCaBaseUrl = process.env.CA_BASE_URL;
  const originalServiceKey = process.env.CC_SERVICE_API_KEY;
  const originalHost = process.env.HOST;
  const originalDbInitialized = db.initialized;
  let sessionSpy: ReturnType<typeof jest.spyOn>;

  beforeAll(() => {
    const expires = new Date();
    expires.setDate(expires.getDate() + 1);

    sessionSpy = jest.spyOn(Auth, "getServerSession").mockResolvedValue({
      user: {
        id: TEST_USER_ID,
        name: "Test User",
        email: "test@example.com",
        image: null,
        role: Roles.User,
      },
      expires: expires.toISOString(),
    } as AppSession);
  });

  beforeEach(() => {
    process.env.NEXT_PUBLIC_FEATURE_FLAGS =
      "CA_SERVICE_INTEGRATION,STATIONARY_ENERGY_AGENTIC";
    process.env.CA_BASE_URL = "http://ca.example";
    process.env.CC_SERVICE_API_KEY = "cc-service-key";
    process.env.HOST = "http://cc.example";
    db.initialized = true;
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  afterAll(() => {
    db.initialized = originalDbInitialized;
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = originalFeatureFlags;
    process.env.CA_BASE_URL = originalCaBaseUrl;
    process.env.CC_SERVICE_API_KEY = originalServiceKey;
    process.env.HOST = originalHost;
    sessionSpy.mockRestore();
  });

  it("returns 400 when the save route receives malformed JSON", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;

    const response = await saveDraft(
      makeRequest(
        "http://localhost:3000/api/v1/stationary-energy-drafts/draft-1/save",
        "POST",
        undefined,
        async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      ),
      { params: Promise.resolve({ draftRunId: TEST_DRAFT_RUN_ID }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Invalid request - Unexpected end of JSON input",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the draft status route receives an invalid inventory UUID", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;

    const response = await getDraftStatus(
      makeRequest(
        "http://localhost:3000/api/v1/stationary-energy-drafts/draft-1?inventory_id=not-a-uuid",
        "GET",
      ),
      { params: Promise.resolve({ draftRunId: TEST_DRAFT_RUN_ID }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Invalid request",
        }),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enriches draft status gas rows with backend-calculated CO2e totals", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const gasToCo2EqSpy = jest.spyOn(db.models.GasToCO2Eq, "findAll");
    gasToCo2EqSpy.mockResolvedValue([
      { gas: "CO2", co2eqPerKg: 1, co2eqYears: 100 },
      { gas: "CH4", co2eqPerKg: 28, co2eqYears: 100 },
      { gas: "N2O", co2eqPerKg: 265, co2eqYears: 100 },
    ] as any);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          draft_run_id: TEST_DRAFT_RUN_ID,
          status: "ready",
          review_decisions: [],
          proposals: [
            {
              proposal_id: "proposal-1",
              proposed_value: {
                row: {
                  gases: [
                    { gas_name: "CH4", emissions_value: "2" },
                    { gas_name: "CO2", emissions_value: "3" },
                  ],
                },
              },
            },
          ],
          source_candidates: [
            {
              datasource_id: "source-1",
              normalized_rows: [
                {
                  gases: [{ gas_name: "N2O", emissions_value: "4" }],
                },
              ],
            },
          ],
        }),
      );

    const response = await getDraftStatus(
      makeRequest(
        `http://localhost:3000/api/v1/stationary-energy-drafts/${TEST_DRAFT_RUN_ID}?inventory_id=${TEST_INVENTORY_ID}`,
        "GET",
      ),
      { params: Promise.resolve({ draftRunId: TEST_DRAFT_RUN_ID }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        proposals: [
          expect.objectContaining({
            proposed_value: expect.objectContaining({
              row: expect.objectContaining({
                emissions_value_100yr: "59",
                emissions_unit: "kgco2e",
                co2eq_years: 100,
              }),
            }),
          }),
        ],
        source_candidates: [
          expect.objectContaining({
            normalized_rows: [
              expect.objectContaining({
                emissions_value_100yr: "1060",
                emissions_unit: "kgco2e",
                co2eq_years: 100,
              }),
            ],
          }),
        ],
      }),
    );
    expect(gasToCo2EqSpy).toHaveBeenCalledTimes(1);
    gasToCo2EqSpy.mockRestore();
  });

  it("forwards upstream JSON error payloads from the start route", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            detail: "bad draft context",
          },
          { status: 422 },
        ),
      );

    const response = await startDraft(
      makeRequest(
        "http://localhost:3000/api/v1/stationary-energy-drafts/start",
        "POST",
        {
          city_id: TEST_CITY_ID,
          inventory_id: TEST_INVENTORY_ID,
        },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      detail: "bad draft context",
    });
  });

  it("uses configured HOST instead of request origin for CA token issuance", async () => {
    process.env.HOST = "https://configured.example";
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          draft_run_id: TEST_DRAFT_RUN_ID,
        }),
      );

    const response = await startDraft(
      makeRequest(
        "https://request-origin.example/api/v1/stationary-energy-drafts/start",
        "POST",
        {
          city_id: TEST_CITY_ID,
          inventory_id: TEST_INVENTORY_ID,
        },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://configured.example/api/v1/internal/ca/user-token/",
    );
  });

  it("preserves JSON token-issuance errors from the shared CA helper", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: "service token rejected",
        },
        { status: 403 },
      ),
    );

    const response = await startDraft(
      makeRequest(
        "http://localhost:3000/api/v1/stationary-energy-drafts/start",
        "POST",
        {
          city_id: TEST_CITY_ID,
          inventory_id: TEST_INVENTORY_ID,
        },
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "service token rejected",
        code: undefined,
        data: {
          detail: "service token rejected",
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves upstream save-route error statuses instead of converting them to 500s", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            detail: "Draft run does not belong to user",
          },
          { status: 403 },
        ),
      );

    const response = await saveDraft(
      makeRequest(
        `http://localhost:3000/api/v1/stationary-energy-drafts/${TEST_DRAFT_RUN_ID}/save`,
        "POST",
        {
          inventory_id: TEST_INVENTORY_ID,
        },
      ),
      { params: Promise.resolve({ draftRunId: TEST_DRAFT_RUN_ID }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: "Draft run does not belong to user",
    });
  });
});
