import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const runId = "11111111-1111-4111-8111-111111111111";
const loadRunCity = jest.fn<() => Promise<string>>();
const canAccessCity = jest.fn<() => Promise<void>>();
const createEventStream = jest.fn<() => ReadableStream<Uint8Array>>();

jest.unstable_mockModule("@/backend/ConceptNoteUploadService", () => ({
  loadConceptNoteRunCity: loadRunCity,
}));
jest.unstable_mockModule("@/backend/ConceptNoteWorkspaceObserver", () => ({
  createConceptNoteWorkspaceEventStream: createEventStream,
}));
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessCity },
}));
jest.unstable_mockModule("@/util/api", () => ({
  apiHandler: (handler: unknown) => handler,
}));

let handler: typeof import("@/app/api/v1/concept-notes/[runId]/events/route").GET;

beforeAll(async () => {
  ({ GET: handler } =
    await import("@/app/api/v1/concept-notes/[runId]/events/route"));
});

beforeEach(() => {
  jest.clearAllMocks();
  loadRunCity.mockResolvedValue("33333333-3333-4333-8333-333333333333");
  canAccessCity.mockResolvedValue(undefined);
  createEventStream.mockReturnValue(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  );
});

const context = {
  params: { runId },
  searchParams: { resources: "run,draft" },
  session: { user: { id: "owner-user" } },
};

describe("Concept Note workspace events route", () => {
  it("authorizes once and returns a non-buffered event stream", async () => {
    const request = new Request("http://localhost", {
      signal: new AbortController().signal,
    });

    const response = await handler(request, context);

    expect(loadRunCity).toHaveBeenCalledWith(
      expect.objectContaining({ runId, userId: "owner-user" }),
    );
    expect(canAccessCity).toHaveBeenCalledTimes(1);
    expect(createEventStream).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: new Set(["run", "draft"]),
        runId,
        userId: "owner-user",
      }),
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  it("rejects an invalid resource before loading the run", async () => {
    await expect(
      handler(new Request("http://localhost"), {
        ...context,
        searchParams: { resources: "proposal" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(loadRunCity).not.toHaveBeenCalled();
  });
});
