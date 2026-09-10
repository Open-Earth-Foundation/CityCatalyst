/** Regression coverage for CC-757's shared issuance, lifetime, and failure boundary. */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { issueClimateAdvisorUserToken } from "@/backend/climate-advisor-token";
import { callConceptNoteApi } from "@/backend/concept-notes";
import { callClimateAdvisor } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { createClimateAdvisorThread } from "@/backend/chat/climate-advisor";
import { logger } from "@/services/logger";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const stateKey = Symbol.for("citycatalyst.ca-user-token-cache.v1");
const user = { userId: "user-a" };
let fetchMock: jest.MockedFunction<typeof fetch>;

/** Build fresh responses because each real fetch body can only be consumed once. */
function tokenResponse(accessToken = "user-a-token", expiresIn = 3600) {
  return Response.json({
    access_token: accessToken,
    expires_in: expiresIn,
    token_type: "Bearer",
  });
}

beforeEach(() => {
  Reflect.deleteProperty(globalThis, stateKey);
  process.env.HOST = "http://cc.example";
  process.env.CA_BASE_URL = "http://ca.example";
  process.env.CC_SERVICE_API_KEY = "secret-service-key";
  process.env.VERIFICATION_TOKEN_SECRET = "signing-secret";
  jest.useFakeTimers({ now: new Date("2026-09-09T12:00:00Z") });
  jest.spyOn(Math, "random").mockReturnValue(0.5);
  jest.spyOn(logger, "warn").mockImplementation(() => {});
  jest.spyOn(logger, "debug").mockImplementation(() => {});
  fetchMock = jest.fn<typeof fetch>();
  global.fetch = fetchMock;
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, stateKey);
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("CA token reuse", () => {
  it("coalesces a burst and reports remaining lifetime without exposing cache objects", async () => {
    fetchMock.mockImplementation(async () => tokenResponse());
    const results = await Promise.all(
      Array.from({ length: 20 }, () => issueClimateAdvisorUserToken(user)),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      results.every((token) => token.access_token === "user-a-token"),
    ).toBe(true);
    results[0].access_token = "tampered";
    jest.setSystemTime(Date.now() + 120_000);
    expect(await issueClimateAdvisorUserToken(user)).toEqual({
      access_token: "user-a-token",
      expires_in: 3480,
      token_type: "Bearer",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("keeps users isolated while inventory remains context", async () => {
    fetchMock.mockImplementation(async (_, init) =>
      tokenResponse(JSON.parse(String(init?.body)).user_id),
    );
    const [a, b, aOtherInventory] = await Promise.all([
      issueClimateAdvisorUserToken({ ...user, inventoryId: "inventory-a" }),
      issueClimateAdvisorUserToken({ userId: "user-b" }),
      issueClimateAdvisorUserToken({ ...user, inventoryId: "inventory-b" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([
      a.access_token,
      b.access_token,
      aOtherInventory.access_token,
    ]).toEqual(["user-a", "user-b", "user-a"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      user_id: "user-a",
      inventory_id: "inventory-a",
    });
  });

  it("refreshes at the 60-second boundary, coalescing the refresh", async () => {
    fetchMock.mockImplementation(async () => tokenResponse());
    await issueClimateAdvisorUserToken(user);
    jest.setSystemTime(Date.now() + 3_539_000);
    expect((await issueClimateAdvisorUserToken(user)).expires_in).toBe(61);
    jest.setSystemTime(Date.now() + 1_000);
    await Promise.all([
      issueClimateAdvisorUserToken(user),
      issueClimateAdvisorUserToken(user),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accounts for issuance latency and does not cache short-lived tokens", async () => {
    fetchMock.mockImplementation(async () => {
      jest.setSystemTime(Date.now() + 1_500);
      return tokenResponse("short", 60);
    });
    expect((await issueClimateAdvisorUserToken(user)).expires_in).toBe(58);
    await issueClimateAdvisorUserToken(user);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used token after 1,000 users", async () => {
    fetchMock.mockImplementation(async () => tokenResponse());
    for (let id = 0; id < 1000; id++)
      await issueClimateAdvisorUserToken({ userId: String(id) });
    await issueClimateAdvisorUserToken({ userId: "0" });
    await issueClimateAdvisorUserToken({ userId: "1000" });
    await issueClimateAdvisorUserToken({ userId: "0" });
    expect(fetchMock).toHaveBeenCalledTimes(1001);
    await issueClimateAdvisorUserToken({ userId: "1" });
    expect(fetchMock).toHaveBeenCalledTimes(1002);
  });

  it.each(["HOST", "CC_SERVICE_API_KEY", "VERIFICATION_TOKEN_SECRET"])(
    "invalidates cached tokens when %s changes",
    async (key) => {
      fetchMock.mockImplementation(async () => tokenResponse());
      await issueClimateAdvisorUserToken(user);
      process.env[key] += "-changed";
      await issueClimateAdvisorUserToken(user);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("does not join an old in-flight request or cache its result after rotation", async () => {
    let completeOld!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeOld = resolve;
        }),
    );
    const oldRequest = issueClimateAdvisorUserToken(user);
    process.env.CC_SERVICE_API_KEY = "rotated-key";
    fetchMock.mockResolvedValueOnce(tokenResponse("new-token"));
    await issueClimateAdvisorUserToken(user);
    completeOld(tokenResponse("old-token"));
    await oldRequest;
    expect((await issueClimateAdvisorUserToken(user)).access_token).toBe(
      "new-token",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares state across module reloads and starts cold after a process-state reset", async () => {
    fetchMock.mockImplementation(async () => tokenResponse());
    await issueClimateAdvisorUserToken(user);
    await jest.isolateModulesAsync(async () => {
      const anotherBundle = await import("@/backend/climate-advisor-token");
      await anotherBundle.issueClimateAdvisorUserToken(user);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(globalThis, stateKey);
    await issueClimateAdvisorUserToken(user);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("CA issuance retries", () => {
  it.each([502, 503, 504])(
    "shares recovery from a cold-cache %s",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response("private gateway body", { status }),
      );
      fetchMock.mockImplementation(async () => tokenResponse());
      const requests = Promise.all([
        issueClimateAdvisorUserToken(user),
        issueClimateAdvisorUserToken(user),
      ]);
      await jest.advanceTimersByTimeAsync(249);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await requests;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each([502, 503, 504])(
    "preserves exhausted %s and allows a later fresh attempt",
    async (status) => {
      fetchMock.mockImplementation(
        async () => new Response("secret-service-key", { status }),
      );
      const failure = expect(
        issueClimateAdvisorUserToken(user),
      ).rejects.toMatchObject({
        statusCode: status,
        expose: true,
        message: "Unable to obtain Climate Advisor access token",
      });
      await jest.advanceTimersByTimeAsync(700);
      await failure;
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(jest.mocked(logger.warn).mock.calls)).not.toContain(
        "secret-service-key",
      );
      fetchMock.mockResolvedValueOnce(tokenResponse());
      await issueClimateAdvisorUserToken(user);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    },
  );

  it("preserves the final status when failures differ", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("secret network diagnostics"))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const failure = expect(
      issueClimateAdvisorUserToken(user),
    ).rejects.toMatchObject({ statusCode: 503 });
    await jest.runAllTimersAsync();
    await failure;
    expect(JSON.stringify(jest.mocked(logger.warn).mock.calls)).not.toContain(
      "secret network diagnostics",
    );
  });

  it("maps exhausted transport errors to 502", async () => {
    fetchMock.mockRejectedValue(new Error("private connection information"));
    const failure = expect(
      issueClimateAdvisorUserToken(user),
    ).rejects.toMatchObject({ statusCode: 502 });
    await jest.runAllTimersAsync();
    await failure;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers from a broken response stream", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("connection reset"));
            },
          }),
        ),
      )
      .mockResolvedValueOnce(tokenResponse());
    const result = issueClimateAdvisorUserToken(user);
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({
      access_token: "user-a-token",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["headers", "body"])(
    "bounds stalled %s and exhausts as 504 within ten seconds",
    async (stage) => {
      fetchMock.mockImplementation(() =>
        stage === "headers"
          ? new Promise<Response>(() => {})
          : Promise.resolve(new Response(new ReadableStream())),
      );
      const started = Date.now();
      const failure = expect(
        issueClimateAdvisorUserToken(user),
      ).rejects.toMatchObject({ statusCode: 504 });
      await jest.runAllTimersAsync();
      await failure;
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(Date.now() - started).toBe(9700);
      expect(
        fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted),
      ).toBe(true);
    },
  );

  it("recovers after a timeout", async () => {
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(tokenResponse());
    const result = issueClimateAdvisorUserToken(user);
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({
      access_token: "user-a-token",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 429, 500])(
    "does not retry HTTP %s",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response("private error", { status }),
      );
      await expect(issueClimateAdvisorUserToken(user)).rejects.toMatchObject({
        statusCode: status,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "not json",
    "null",
    JSON.stringify({ access_token: "" }),
    JSON.stringify({
      access_token: "token",
      expires_in: -1,
      token_type: "Bearer",
    }),
    JSON.stringify({
      access_token: "token",
      expires_in: 3600,
      token_type: "Basic",
    }),
  ])("does not retry or cache malformed response %s", async (body) => {
    fetchMock.mockResolvedValueOnce(new Response(body));
    await expect(issueClimateAdvisorUserToken(user)).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(tokenResponse());
    await issueClimateAdvisorUserToken(user);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("shared caller integration", () => {
  it("coalesces CNB and Stationary Energy without replaying downstream mutations", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("user-token")
        ? tokenResponse()
        : new Response(null, { status: 503 }),
    );
    const responses = await Promise.all([
      callConceptNoteApi({
        ...user,
        path: "/v1/concept-notes/start",
        method: "POST",
        body: { city_id: "city" },
      }),
      callClimateAdvisor({
        tokenUserID: user.userId,
        inventoryId: "inventory",
        path: "/v1/stationary-energy-drafts/start",
        method: "POST",
        requestId: "request-123",
        body: { inventory_id: "inventory" },
      }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([503, 503]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const stationary = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("stationary-energy"),
    );
    expect(stationary?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer user-a-token",
        "X-Request-ID": "request-123",
      },
    });
  });

  it("passes remaining token lifetime to a newly created chat thread", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    await issueClimateAdvisorUserToken(user);
    jest.setSystemTime(Date.now() + 120_000);
    fetchMock.mockResolvedValueOnce(Response.json({ thread_id: "thread" }));
    await createClimateAdvisorThread(user);
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body.context).toMatchObject({
      access_token: "user-a-token",
      expires_in: 3480,
      issued_at: new Date().toISOString(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
