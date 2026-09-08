import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import createHttpError from "http-errors";

import type { ClimateAdvisorTokenResponse } from "@/backend/climate-advisor-connection";
import type { AppSession } from "@/lib/auth";
import { Roles } from "@/util/types";

const cityId = "11111111-1111-4111-8111-111111111111";
const otherCityId = "22222222-2222-4222-8222-222222222222";
const ownerId = "owner-user";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";

const canAccessCity =
  jest.fn<
    (session: AppSession, cityId: string, options: unknown) => Promise<void>
  >();
const callClimateAdvisorChat =
  jest.fn<(request: unknown) => Promise<Response>>();
const issueClimateAdvisorUserToken = jest.fn<
  (request: { userId: string }) => Promise<{
    access_token: string;
    expires_in: number;
    token_type: string;
  }>
>();
const loggerError = jest.fn();

jest.unstable_mockModule("@/backend/chat/climate-advisor", () => ({
  callClimateAdvisorChat,
  issueClimateAdvisorUserToken,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: loggerError },
}));

const session: AppSession = {
  expires: "2026-09-01T00:00:00.000Z",
  user: { id: ownerId, role: Roles.User },
};

let callAuthorizedConceptNoteApi: typeof import("@/backend/concept-notes").callAuthorizedConceptNoteApi;
let callConceptNoteApi: typeof import("@/backend/concept-notes").callConceptNoteApi;
let conceptNoteRunResponse: typeof import("@/backend/concept-notes").conceptNoteRunResponse;
let resetConceptNoteUserTokenCacheForTests: typeof import("@/backend/concept-notes").resetConceptNoteUserTokenCacheForTests;

beforeAll(async () => {
  ({
    callAuthorizedConceptNoteApi,
    callConceptNoteApi,
    conceptNoteRunResponse,
    resetConceptNoteUserTokenCacheForTests,
  } = await import("@/backend/concept-notes"));
});

describe("Concept Note API authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetConceptNoteUserTokenCacheForTests();
    canAccessCity.mockResolvedValue(undefined);
    issueClimateAdvisorUserToken.mockResolvedValue({
      access_token: "ca-token",
      expires_in: 300,
      token_type: "Bearer",
    });
    callClimateAdvisorChat.mockResolvedValue(
      Response.json({ city_id: cityId }),
    );
  });

  it("authorizes the city before issuing a token and preserves request headers", async () => {
    await callAuthorizedConceptNoteApi({
      cityId,
      headers: { "Idempotency-Key": idempotencyKey },
      method: "POST",
      path: "/v1/concept-notes/run-id/duplicate",
      requestId: "request-1",
      session,
    });

    expect(canAccessCity).toHaveBeenCalledWith(session, cityId, {
      includeResource: false,
    });
    expect(issueClimateAdvisorUserToken).toHaveBeenCalledWith({
      userId: ownerId,
    });
    expect(callClimateAdvisorChat).toHaveBeenCalledWith({
      path: "/v1/concept-notes/run-id/duplicate",
      method: "POST",
      body: undefined,
      searchParams: undefined,
      headers: {
        "Idempotency-Key": idempotencyKey,
        Authorization: "Bearer ca-token",
        "X-Request-ID": "request-1",
      },
    });
    expect(canAccessCity.mock.invocationCallOrder[0]).toBeLessThan(
      issueClimateAdvisorUserToken.mock.invocationCallOrder[0],
    );
  });

  it("does not issue a token or call upstream when city access is denied", async () => {
    canAccessCity.mockRejectedValueOnce(
      new createHttpError.Forbidden("City access denied"),
    );

    await expect(
      callAuthorizedConceptNoteApi({
        cityId,
        path: "/v1/concept-notes/run-id",
        session,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(issueClimateAdvisorUserToken).not.toHaveBeenCalled();
    expect(callClimateAdvisorChat).not.toHaveBeenCalled();
  });

  it("reuses one user token across sequential Concept Note requests", async () => {
    await callConceptNoteApi({
      path: "/v1/concept-notes/run-1",
      userId: ownerId,
    });
    await callConceptNoteApi({
      path: "/v1/concept-notes/run-1",
      userId: ownerId,
    });

    expect(issueClimateAdvisorUserToken).toHaveBeenCalledTimes(1);
    expect(callClimateAdvisorChat).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent user-token issuance", async () => {
    let resolveToken:
      ((token: ClimateAdvisorTokenResponse) => void) | undefined;
    issueClimateAdvisorUserToken.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );

    const first = callConceptNoteApi({
      path: "/v1/concept-notes/run-1",
      userId: ownerId,
    });
    const second = callConceptNoteApi({
      path: "/v1/concept-notes/run-1/draft",
      userId: ownerId,
    });
    expect(issueClimateAdvisorUserToken).toHaveBeenCalledTimes(1);

    resolveToken?.({
      access_token: "shared-token",
      expires_in: 300,
      token_type: "Bearer",
    });
    await Promise.all([first, second]);

    expect(issueClimateAdvisorUserToken).toHaveBeenCalledTimes(1);
    expect(callClimateAdvisorChat).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed token issuance", async () => {
    issueClimateAdvisorUserToken
      .mockRejectedValueOnce(new Error("token service unavailable"))
      .mockResolvedValueOnce({
        access_token: "recovered-token",
        expires_in: 300,
        token_type: "Bearer",
      });

    await expect(
      callConceptNoteApi({ path: "/v1/concept-notes/run-1", userId: ownerId }),
    ).rejects.toThrow("token service unavailable");
    await callConceptNoteApi({
      path: "/v1/concept-notes/run-1",
      userId: ownerId,
    });

    expect(issueClimateAdvisorUserToken).toHaveBeenCalledTimes(2);
  });

  it("does not reuse tokens inside the refresh margin", async () => {
    issueClimateAdvisorUserToken.mockResolvedValue({
      access_token: "short-token",
      expires_in: 30,
      token_type: "Bearer",
    });

    await callConceptNoteApi({
      path: "/v1/concept-notes/run-1",
      userId: ownerId,
    });
    await callConceptNoteApi({
      path: "/v1/concept-notes/run-1",
      userId: ownerId,
    });

    expect(issueClimateAdvisorUserToken).toHaveBeenCalledTimes(2);
  });

  it("keeps cached tokens isolated by user", async () => {
    await callConceptNoteApi({
      path: "/v1/concept-notes/run-1",
      userId: ownerId,
    });
    await callConceptNoteApi({
      path: "/v1/concept-notes/run-2",
      userId: "other-owner",
    });

    expect(issueClimateAdvisorUserToken).toHaveBeenCalledTimes(2);
  });
});

describe("Concept Note run responses", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("logs the validation error for a malformed successful response", async () => {
    await expect(
      conceptNoteRunResponse(Response.json({ city_id: "invalid" }), cityId),
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(loggerError).toHaveBeenCalledWith(
      { error: expect.anything() },
      "Climate Advisor returned an invalid concept-note run",
    );
  });

  it("rejects a successful response for a different city", async () => {
    await expect(
      conceptNoteRunResponse(Response.json({ city_id: otherCityId }), cityId),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
