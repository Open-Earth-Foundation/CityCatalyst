/** @jest-environment jsdom */

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
import { TextDecoder, TextEncoder } from "node:util";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.unstable_mockModule("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));
jest.unstable_mockModule("@/services/concept-note-edit-api", () => ({
  editApi: {
    util: {
      upsertQueryEntries: (entries: unknown) => upsertQueryEntries(entries),
    },
  },
}));
const dispatch = jest.fn();
const upsertQueryEntries = jest.fn((entries: unknown) => ({ entries }));
const invalidateTags = jest.fn((tags: unknown) => ({ tags }));
const updateQueryData = jest.fn(
  (endpoint: string, args: unknown, update: (current: object) => void) => ({
    args,
    endpoint,
    update,
  }),
);

jest.unstable_mockModule("@/lib/hooks", () => ({
  useAppDispatch: () => dispatch,
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: { util: { updateQueryData, upsertQueryEntries, invalidateTags } },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { warn: jest.fn() },
}));

let useConceptNoteWorkspaceEvents: typeof import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-events").useConceptNoteWorkspaceEvents;
let container: HTMLDivElement;
let root: Root;
const originalFetch = globalThis.fetch;

function Harness({
  upload = false,
  run = false,
}: {
  upload?: boolean;
  run?: boolean;
}): null {
  useConceptNoteWorkspaceEvents({
    cityId: "city-1",
    observeDraft: !upload,
    observeRun: run,
    observeUpload: upload,
    runId: "run-1",
    uploadId: upload ? "upload-1" : null,
  });
  return null;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(globalThis, { TextDecoder, TextEncoder });
  ({ useConceptNoteWorkspaceEvents } =
    await import("@/components/ConceptNoteWorkspace/use-concept-note-workspace-events"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  }
  jest.restoreAllMocks();
});

describe("useConceptNoteWorkspaceEvents", () => {
  it("hydrates terminal upload state without requiring an existing cache value", async () => {
    const snapshot = {
      sequence: 1,
      upload: { uploadId: "upload-1", runId: "run-1", status: "ready" },
    };
    let delivered = false;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (delivered) return { done: true };
            delivered = true;
            return {
              done: false,
              value: new TextEncoder().encode(
                `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\nevent: done\ndata: {}\n\n`,
              ),
            };
          },
          releaseLock: jest.fn(),
        }),
      },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await act(async () => {
      root.render(<Harness upload />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(upsertQueryEntries).toHaveBeenCalledWith([
      {
        endpointName: "getConceptNoteUploadStatus",
        arg: { runId: "run-1", uploadId: "upload-1" },
        value: snapshot.upload,
      },
    ]);
    expect(updateQueryData).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["ready", "failed"])(
    "refreshes the city list once when a bundle becomes %s",
    async (status) => {
      const run = {
        run_id: "run-1",
        progress_summary: {
          context_bundle: {
            status,
            build_id: "build-1",
            included_upload_ids: ["plan-1"],
          },
        },
      };
      const frames =
        [1, 2]
          .map(
            (sequence) =>
              `event: snapshot\ndata: ${JSON.stringify({ sequence, run })}\n\n`,
          )
          .join("") + "event: done\ndata: {}\n\n";
      let delivered = false;
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (delivered) return { done: true };
              delivered = true;
              return { done: false, value: new TextEncoder().encode(frames) };
            },
            releaseLock: jest.fn(),
          }),
        },
      })) as unknown as typeof fetch;
      await act(async () => {
        root.render(<Harness run />);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(invalidateTags).toHaveBeenCalledTimes(1);
      expect(invalidateTags).toHaveBeenCalledWith([
        { type: "ConceptNoteRuns", id: "city-1" },
      ]);
    },
  );

  it("updates the draft cache and does not reconnect after terminal state", async () => {
    const payload =
      [
        "event: snapshot",
        'data: {"sequence":1,"draft":{"run_id":"run-1","status":"complete"}}',
        "",
        "event: done",
        'data: {"ok":true}',
        "",
      ].join("\n") + "\n";
    let delivered = false;
    const releaseLock = jest.fn();
    const fetchMock = jest.fn(async () => ({
      body: {
        getReader: () => ({
          read: async () => {
            if (delivered) return { done: true, value: undefined };
            delivered = true;
            return { done: false, value: new TextEncoder().encode(payload) };
          },
          releaseLock,
        }),
      },
      ok: true,
      status: 200,
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await act(async () => {
      root.render(<Harness />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsertQueryEntries).toHaveBeenCalledWith([
      {
        endpointName: "getConceptNoteDraft",
        arg: "run-1",
        value: { run_id: "run-1", status: "complete" },
      },
    ]);
    expect(invalidateTags).toHaveBeenCalledWith([
      { type: "ConceptNoteRuns", id: "run-1" },
    ]);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});
