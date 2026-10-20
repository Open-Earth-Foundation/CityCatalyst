import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const cityId = "22222222-2222-4222-8222-222222222222";
const ownerId = "owner-user";
const loadRunCity = jest.fn<() => Promise<string>>();
const canAccessCity = jest.fn<() => Promise<void>>();
const issueClimateAdvisorUserToken = jest.fn<
  () => Promise<{
    access_token: string;
    expires_in: number;
    token_type: "Bearer";
  }>
>();

jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/backend/climate-advisor-token", () => ({
  issueClimateAdvisorUserToken,
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let postSuggestions: typeof import("@/app/api/v1/concept-notes/[runId]/chat/suggestions/route").POST;
let postGapQuestion: typeof import("@/app/api/v1/concept-notes/[runId]/gap-question/route").POST;
const originalFetch = globalThis.fetch;
const originalCaBaseUrl = process.env.CA_BASE_URL;

beforeAll(async () => {
  ({ POST: postSuggestions } =
    await import("@/app/api/v1/concept-notes/[runId]/chat/suggestions/route"));
  ({ POST: postGapQuestion } =
    await import("@/app/api/v1/concept-notes/[runId]/gap-question/route"));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CA_BASE_URL = "http://climate-advisor.test";
  loadRunCity.mockResolvedValue(cityId);
  canAccessCity.mockResolvedValue(undefined);
  issueClimateAdvisorUserToken.mockResolvedValue({
    access_token: "ca-token",
    expires_in: 300,
    token_type: "Bearer",
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalCaBaseUrl === undefined) delete process.env.CA_BASE_URL;
  else process.env.CA_BASE_URL = originalCaBaseUrl;
});

it.each(["chat", "gap"])(
  "aborts an in-flight %s suggestion when the browser request is cancelled",
  async (kind) => {
    let reportUpstreamStart!: (signal: AbortSignal | undefined) => void;
    const upstreamStarted = new Promise<AbortSignal | undefined>((resolve) => {
      reportUpstreamStart = resolve;
    });
    let upstreamCancelled = false;
    globalThis.fetch = jest.fn<typeof fetch>((_url, init) => {
      const signal = init?.signal ?? undefined;
      reportUpstreamStart(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            upstreamCancelled = true;
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });

    const controller = new AbortController();
    const request = new Request(
      "http://localhost/api/v1/concept-notes/chat/suggestions",
      {
        method: "POST",
        body: JSON.stringify(
          kind === "chat"
            ? { language: "en", tab: "draft" }
            : {
                language: "en",
                chapter_id: cityId,
                gap_id: null,
                question: "Instrument?",
              },
        ),
        signal: controller.signal,
      },
    );
    const response = (kind === "chat" ? postSuggestions : postGapQuestion)(
      request,
      {
        session: { user: { id: ownerId } },
        params: { runId },
      },
    );

    const upstreamSignal = await upstreamStarted;
    expect(upstreamSignal).toBe(request.signal);
    controller.abort();
    expect(upstreamSignal?.aborted).toBe(true);
    await expect(response).rejects.toMatchObject({ statusCode: 502 });
    expect(upstreamCancelled).toBe(true);
  },
);

it("requires authentication and validates gap identifiers before calling upstream", async () => {
  const request = () =>
    new Request("http://localhost/gap-question", {
      method: "POST",
      body: JSON.stringify({
        chapter_id: "invalid",
        gap_id: null,
        question: "Instrument?",
      }),
    });
  await expect(
    postGapQuestion(request(), { session: null, params: { runId } }),
  ).rejects.toMatchObject({ statusCode: 401 });
  await expect(
    postGapQuestion(request(), {
      session: { user: { id: ownerId } },
      params: { runId },
    }),
  ).rejects.toThrow();
  expect(loadRunCity).not.toHaveBeenCalled();
  expect(issueClimateAdvisorUserToken).not.toHaveBeenCalled();
});
