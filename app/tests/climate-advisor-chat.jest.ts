import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";

const warn = jest.fn();
jest.unstable_mockModule("@/services/logger", () => ({ logger: { warn } }));
jest.unstable_mockModule("@/backend/climate-advisor-token", () => ({
  issueClimateAdvisorUserToken: jest.fn(),
}));

const { callClimateAdvisorChat } =
  await import("@/backend/chat/climate-advisor");

const originalFetch = global.fetch;
const originalBaseUrl = process.env.CA_BASE_URL;
const fetchMock = jest.fn<typeof fetch>();
const path = "/v1/concept-notes/run/workspace?private=embedded";
const request = {
  path,
  searchParams: { user_id: "private-user" },
  headers: { Authorization: "Bearer private-token" },
};

function resetError(code = "ECONNRESET") {
  return new TypeError("fetch failed", { cause: { code } });
}

function waitForAbort(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    const signal = init!.signal!;
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      ms,
    );
    return controller.signal;
  });
  process.env.CA_BASE_URL = "http://ca.example";
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalBaseUrl === undefined) delete process.env.CA_BASE_URL;
  else process.env.CA_BASE_URL = originalBaseUrl;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it.each(["GET", "HEAD"] as const)(
  "retries %s after a transport error",
  async (method) => {
    const response = new Response(null, { status: 200 });
    fetchMock
      .mockRejectedValueOnce(resetError())
      .mockResolvedValueOnce(response);
    const result = callClimateAdvisorChat({ ...request, method });
    await jest.advanceTimersByTimeAsync(199);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

it.each(["POST", "PATCH", "DELETE", "PUT", "SSE"] as const)(
  "keeps %s single-shot and forwards its signal as-is",
  async (kind) => {
    const signal = new AbortController().signal;
    const failure = resetError();
    fetchMock.mockRejectedValueOnce(failure);
    await expect(
      callClimateAdvisorChat({
        ...request,
        signal,
        method: kind === "SSE" ? "GET" : kind,
        headers:
          kind === "SSE"
            ? { Accept: "text/event-stream; q=1" }
            : request.headers,
      }),
    ).rejects.toMatchObject({ statusCode: 502, cause: failure });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(signal);
  },
);

it("aborts a timed out read before retrying", async () => {
  const response = Response.json({ ok: true });
  fetchMock
    .mockImplementationOnce(waitForAbort)
    .mockResolvedValueOnce(response);
  const result = callClimateAdvisorChat(request);
  await jest.advanceTimersByTimeAsync(4_999);
  const signal = fetchMock.mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(signal?.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(200);
  await expect(result).resolves.toBe(response);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(false);
});

it("exhausts three transport attempts and preserves the last error", async () => {
  const finalError = resetError("UND_ERR_SOCKET");
  fetchMock
    .mockRejectedValueOnce(resetError("ECONNREFUSED"))
    .mockRejectedValueOnce(resetError())
    .mockRejectedValueOnce(finalError);
  const failure = expect(callClimateAdvisorChat(request)).rejects.toMatchObject(
    {
      statusCode: 502,
      cause: finalError,
    },
  );
  await jest.advanceTimersByTimeAsync(799);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(1);
  await failure;
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(warn.mock.lastCall?.[0]).toMatchObject({
    cause_code: "UND_ERR_SOCKET",
  });
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
});

it("exhausts stalled attempts within the overall budget", async () => {
  fetchMock.mockImplementation(waitForAbort);
  const failure = expect(callClimateAdvisorChat(request)).rejects.toMatchObject(
    {
      statusCode: 502,
      cause: { name: "TimeoutError" },
    },
  );
  await jest.advanceTimersByTimeAsync(16_000);
  await failure;
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(
    true,
  );
});

it.each(["already aborted", "fetch", "backoff"] as const)(
  "does not retry a caller abort during %s",
  async (when) => {
    const controller = new AbortController();
    const reason = new DOMException("Caller stopped", "AbortError");
    if (when === "already aborted") controller.abort(reason);
    if (when === "backoff") fetchMock.mockRejectedValueOnce(resetError());
    else fetchMock.mockImplementation(waitForAbort);
    const failure = expect(
      callClimateAdvisorChat({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ statusCode: 502, cause: reason });
    await jest.advanceTimersByTimeAsync(1);
    controller.abort(reason);
    await failure;
    await jest.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(when === "already aborted" ? 0 : 1);
    expect(warn).toHaveBeenCalledTimes(1);
  },
);

it("returns upstream status and body after one attempt", async () => {
  const response = Response.json({ detail: "Unavailable" }, { status: 503 });
  fetchMock.mockResolvedValueOnce(response);
  await expect(callClimateAdvisorChat(request)).resolves.toBe(response);
  await expect(response.json()).resolves.toEqual({ detail: "Unavailable" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
