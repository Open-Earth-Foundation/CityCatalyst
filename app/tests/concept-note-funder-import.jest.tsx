/** @jest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import type {
  ConceptNoteFunderImport,
  ConceptNoteFunderImportResponse,
} from "@/util/types";
import type { FunderImportFlow } from "@/components/ConceptNoteWorkspace/use-funder-import";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const currentImport: ConceptNoteFunderImport = {
  import_id: "import-1",
  upload_id: "upload-1",
  filename: "call.pdf",
  status: "processing",
  draft: null,
  error_code: null,
};
let serverImport: ConceptNoteFunderImport | null;
let status: string;
let fetching: boolean;
let uploadResult: ReturnType<typeof deferred<{ uploadId: string }>>;
let flow: FunderImportFlow;
const start = jest.fn<() => Promise<ConceptNoteFunderImportResponse>>();
const discard =
  jest.fn<(args: { runId: string; importId: string }) => Promise<void>>();
const dispatch = jest.fn();
const uploadSource = jest.fn(() => ({ unwrap: () => uploadResult.promise }));
const startImport = jest.fn(() => ({ unwrap: start }));
const discardImport = jest.fn((args: { runId: string; importId: string }) => ({
  unwrap: () => discard(args),
}));
const retryUpload = jest.fn(() => ({ unwrap: async () => undefined }));

jest.unstable_mockModule("@/components/ConceptNoteWiringHarness/utils", () => ({
  conceptNoteSourceLabel: (name: string) => name,
  shouldPollConceptNoteUpload: (value: string) => value === "processing",
  validateConceptNoteSourceFile: async () => null,
}));
jest.unstable_mockModule("@/lib/hooks", () => ({
  useAppDispatch: () => dispatch,
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetConceptNoteFunderImportQuery: () => ({
      currentData: { funder_import: serverImport },
      isSuccess: true,
      isFetching: fetching,
    }),
    useGetConceptNoteUploadStatusQuery: (
      args: { uploadId: string },
      options: { skip: boolean },
    ) => ({
      currentData: options.skip
        ? undefined
        : { uploadId: args.uploadId, status, canRetry: true },
    }),
    useUploadConceptNoteSourceMutation: () => [uploadSource, {}],
    useRetryConceptNoteUploadMutation: () => [
      retryUpload,
      { isLoading: false },
    ],
    useStartConceptNoteFunderImportMutation: () => [
      startImport,
      { isLoading: false },
    ],
    useDiscardConceptNoteFunderImportMutation: () => [
      discardImport,
      { isLoading: false },
    ],
    util: {
      upsertQueryData: (
        _endpoint: string,
        _runId: string,
        value: ConceptNoteFunderImportResponse,
      ) => value,
    },
  },
}));

let useFunderImport: typeof import("@/components/ConceptNoteWorkspace/use-funder-import").useFunderImport;
let root: Root;
let container: HTMLDivElement;
function Harness({ runId = "run" }: { runId?: string }) {
  const current = useFunderImport({ cityId: "city", runId });
  useEffect(() => {
    flow = current;
  }, [current]);
  return null;
}
async function remount(runId = "run") {
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<Harness runId={runId} />));
}
async function upload() {
  await act(async () => {
    const pending = flow.uploadFile(new File(["pdf"], "call.pdf"));
    uploadResult.resolve({ uploadId: "upload-1" });
    await pending;
  });
}

beforeAll(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  ({ useFunderImport } =
    await import("@/components/ConceptNoteWorkspace/use-funder-import"));
});
beforeEach(async () => {
  jest.clearAllMocks();
  sessionStorage.clear();
  serverImport = null;
  status = "processing";
  fetching = false;
  uploadResult = deferred();
  start.mockResolvedValue({ funder_import: currentImport });
  discard.mockImplementation(async ({ importId }) => {
    if (serverImport?.import_id === importId) serverImport = null;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

it("resumes a converting upload after remount and starts extraction once ready", async () => {
  await upload();
  expect(flow.phase).toBe("converting");
  await remount();
  expect(flow.phase).toBe("converting");
  status = "ready";
  await act(async () => root.render(<Harness />));
  expect(startImport).toHaveBeenCalledTimes(1);
  expect(startImport).toHaveBeenCalledWith({
    runId: "run",
    uploadId: "upload-1",
  });
  expect(sessionStorage.length).toBe(0);
});

it("waits for the refreshed import before recovering an already accepted start", async () => {
  await upload();
  status = "ready";
  fetching = true;
  await remount();
  expect(startImport).not.toHaveBeenCalled();
  serverImport = currentImport;
  fetching = false;
  await act(async () => root.render(<Harness />));
  expect(flow.phase).toBe("reading");
  expect(startImport).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0);
});

it("does not recover another run's pending upload", async () => {
  await upload();
  status = "ready";
  await remount("other-run");
  expect(flow.phase).toBe("idle");
  expect(startImport).not.toHaveBeenCalled();
});

it("does not start extraction or persist a late upload after discard", async () => {
  let pending!: Promise<void>;
  await act(async () => {
    pending = flow.uploadFile(new File(["pdf"], "call.pdf"));
  });
  expect(flow.phase).toBe("uploading");
  await act(async () => flow.discard());
  status = "ready";
  await act(async () => {
    uploadResult.resolve({ uploadId: "upload-1" });
    await pending;
  });
  expect(flow.phase).toBe("idle");
  expect(startImport).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0);
  await remount();
  expect(flow.phase).toBe("idle");
});

it("discards only the late accepted import when cancelled during POST", async () => {
  const accepted = deferred<ConceptNoteFunderImportResponse>();
  start.mockReturnValue(accepted.promise);
  status = "ready";
  await upload();
  expect(startImport).toHaveBeenCalledTimes(1);
  let cancelled!: Promise<void>;
  await act(async () => {
    cancelled = flow.discard();
  });
  await act(async () => {
    accepted.resolve({ funder_import: currentImport });
    await cancelled;
  });
  expect(discard).toHaveBeenCalledTimes(1);
  expect(discard).toHaveBeenCalledWith({
    runId: "run",
    importId: "import-1",
  });
  expect(dispatch).not.toHaveBeenCalled();
  expect(flow.phase).toBe("idle");
  expect(sessionStorage.length).toBe(0);
});

it("ignores a late old upload after choosing a replacement", async () => {
  let first!: Promise<void>;
  const oldResult = uploadResult;
  await act(async () => {
    first = flow.uploadFile(new File(["pdf"], "old.pdf"));
  });
  await act(async () => flow.chooseAnotherFile());
  uploadResult = deferred();
  await upload();
  await act(async () => {
    oldResult.resolve({ uploadId: "old-upload" });
    await first;
  });
  expect(flow.filename).toBe("call.pdf");
  expect(flow.phase).toBe("converting");
  await remount();
  expect(flow.filename).toBe("call.pdf");
});

it("keeps the server import visible when discard fails", async () => {
  serverImport = currentImport;
  discard.mockRejectedValue(new Error("unavailable"));
  await act(async () => root.render(<Harness />));
  await act(async () => {
    await expect(flow.discard()).rejects.toThrow("unavailable");
  });
  expect(flow.phase).toBe("reading");
});

it("cancels a scheduled upload-not-ready retry on discard", async () => {
  jest.useFakeTimers();
  status = "ready";
  start.mockRejectedValue({ data: { detail: { code: "upload_not_ready" } } });
  await upload();
  expect(startImport).toHaveBeenCalledTimes(1);
  await act(async () => flow.discard());
  await act(async () => jest.advanceTimersByTime(10000));
  expect(startImport).toHaveBeenCalledTimes(1);
  expect(flow.phase).toBe("idle");
});
