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
  jest.clearAllMocks();
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

  it("marks transient upstream failures as retryable", async () => {
    callConceptNoteApi.mockResolvedValueOnce(
      Response.json({ detail: "unavailable" }, { status: 503 }),
    );

    const events = await observeDraft();

    expect(events).toContain("event: error");
    expect(events).toContain('"retryable":true');
    expect(events).toContain('"status":503');
  });
});
