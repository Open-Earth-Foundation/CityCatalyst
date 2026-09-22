import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const callConceptNoteApi = jest.fn<() => Promise<Response>>();
const loadUploadStatus = jest.fn<() => Promise<never>>();

jest.unstable_mockModule("@/backend/concept-notes", () => ({
  callConceptNoteApi,
  readConceptNoteApiPayload: (response: Response) => response.json(),
}));
jest.unstable_mockModule("@/backend/ConceptNoteUploadStatusService", () => ({
  loadConceptNoteUploadStatus: loadUploadStatus,
}));

let createConceptNoteWorkspaceEventStream: typeof import("@/backend/ConceptNoteWorkspaceObserver").createConceptNoteWorkspaceEventStream;

beforeAll(async () => {
  ({ createConceptNoteWorkspaceEventStream } =
    await import("@/backend/ConceptNoteWorkspaceObserver"));
});

beforeEach(() => {
  jest.resetAllMocks();
});

function draft(status: "running" | "complete"): Response {
  return Response.json({
    run_id: runId,
    status,
    completed_chapters: status === "complete" ? 1 : 0,
    total_chapters: 1,
    current_chapter_id: status === "running" ? runId : null,
    error_code: null,
    chapters: [],
  });
}

async function observeDraft(): Promise<string> {
  const controller = new AbortController();
  const stream = createConceptNoteWorkspaceEventStream({
    runId,
    userId: "owner-user",
    resources: new Set(["draft"]),
    signal: controller.signal,
    intervalMs: 0,
  });
  return new Response(stream).text();
}

describe("Concept Note workspace observer", () => {
  it("emits changed snapshots and closes after terminal state", async () => {
    callConceptNoteApi
      .mockResolvedValueOnce(draft("running"))
      .mockResolvedValueOnce(draft("running"))
      .mockResolvedValueOnce(draft("complete"));

    const events = await observeDraft();

    expect(callConceptNoteApi).toHaveBeenCalledTimes(3);
    expect(events.match(/event: snapshot/g)).toHaveLength(2);
    expect(events).toContain('"status":"running"');
    expect(events).toContain('"status":"complete"');
    expect(events).toContain("event: done");
  });

  it("retries transient failures on the same stream", async () => {
    callConceptNoteApi
      .mockResolvedValueOnce(
        Response.json({ detail: "unavailable" }, { status: 503 }),
      )
      .mockResolvedValueOnce(draft("complete"));

    const events = await observeDraft();

    expect(events).not.toContain("event: error");
    expect(events).toContain("event: done");
    expect(callConceptNoteApi).toHaveBeenCalledTimes(2);
  });
});

function streamFor(
  userId = "owner-user",
  signal = new AbortController().signal,
) {
  return createConceptNoteWorkspaceEventStream({
    runId,
    userId,
    resources: new Set(["draft"]),
    signal,
    intervalMs: 0,
  });
}

it("shares upstream reads between simultaneous subscribers", async () => {
  let release!: (response: Response) => void;
  callConceptNoteApi.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = new Response(streamFor()).text();
  const second = new Response(streamFor()).text();
  expect(callConceptNoteApi).toHaveBeenCalledTimes(1);
  release(draft("complete"));
  const results = await Promise.all([first, second]);
  expect(results.every((result) => result.includes("event: done"))).toBe(true);
  expect(callConceptNoteApi).toHaveBeenCalledTimes(1);
});

it("never shares user-scoped reads across different users", async () => {
  callConceptNoteApi.mockImplementation(async () => draft("complete"));
  await Promise.all([
    new Response(streamFor("one")).text(),
    new Response(streamFor("two")).text(),
  ]);
  expect(callConceptNoteApi).toHaveBeenCalledTimes(2);
});

it("keeps the shared observation alive when one subscriber disconnects", async () => {
  let release!: (response: Response) => void;
  callConceptNoteApi.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const cancelled = new AbortController();
  const first = new Response(streamFor("owner-user", cancelled.signal)).text();
  const second = new Response(streamFor()).text();
  cancelled.abort();
  release(draft("complete"));
  expect(await first).toBe("");
  expect(await second).toContain("event: done");
  expect(callConceptNoteApi).toHaveBeenCalledTimes(1);
});

it("performs no further reads after the last subscriber disconnects", async () => {
  let release!: (response: Response) => void;
  callConceptNoteApi.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const stream = streamFor();
  await stream.cancel();
  release(draft("running"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(callConceptNoteApi).toHaveBeenCalledTimes(1);
});

it("backs off unchanged status and stops after terminal state", async () => {
  jest.useFakeTimers();
  try {
    callConceptNoteApi.mockImplementation(async () => draft("running"));
    const abort = new AbortController();
    const text = new Response(
      createConceptNoteWorkspaceEventStream({
        runId,
        userId: "budget-user",
        resources: new Set(["draft"]),
        signal: abort.signal,
      }),
    ).text();
    await jest.advanceTimersByTimeAsync(60_000);
    // Initial read, then at 10s, 30s, 60s; heartbeat frames cause no reads.
    expect(callConceptNoteApi).toHaveBeenCalledTimes(4);
    callConceptNoteApi.mockImplementation(async () => draft("complete"));
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await text).toContain("event: done");
    await jest.advanceTimersByTimeAsync(60_000);
    expect(callConceptNoteApi).toHaveBeenCalledTimes(5);
  } finally {
    jest.useRealTimers();
  }
});

it("honors upstream Retry-After without making subscribers reconnect", async () => {
  jest.useFakeTimers();
  try {
    callConceptNoteApi
      .mockResolvedValueOnce(
        Response.json(
          {},
          {
            status: 429,
            headers: { "Retry-After": "60" },
          },
        ),
      )
      .mockResolvedValueOnce(draft("complete"));
    const text = new Response(
      createConceptNoteWorkspaceEventStream({
        runId,
        userId: "backoff-user",
        resources: new Set(["draft"]),
        signal: new AbortController().signal,
      }),
    ).text();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(callConceptNoteApi).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(await text).toContain("event: done");
    expect(callConceptNoteApi).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

it("observes processing edit proposals and stops when review becomes available", async () => {
  const proposal = { proposal_id: runId, run_id: runId, status: "processing" };
  callConceptNoteApi
    .mockResolvedValueOnce(Response.json([proposal]))
    .mockResolvedValueOnce(
      Response.json([{ ...proposal, status: "proposed" }]),
    );
  const events = await new Response(
    createConceptNoteWorkspaceEventStream({
      runId,
      userId: "edits-user",
      resources: new Set(["edits"]),
      signal: new AbortController().signal,
      intervalMs: 0,
    }),
  ).text();
  expect(events).toContain('"status":"proposed"');
  expect(events).toContain("event: done");
  expect(callConceptNoteApi).toHaveBeenCalledTimes(2);
});
