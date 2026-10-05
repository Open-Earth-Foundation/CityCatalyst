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
  stage: "converting",
  draft: null,
  error_code: null,
};
let serverImport: ConceptNoteFunderImport | null;
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
  validateConceptNoteSourceFile: async () => null,
}));
jest.unstable_mockModule("@/lib/hooks", () => ({
  useAppDispatch: () => dispatch,
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetConceptNoteFunderImportQuery: () => ({
      currentData: { funder_import: serverImport },
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
async function render(runId = "run") {
  await act(async () => root.render(<Harness runId={runId} />));
}
async function upload(name = "call.pdf", uploadId = "upload-1") {
  await act(async () => {
    const pending = flow.uploadFile(new File(["pdf"], name));
    uploadResult.resolve({ uploadId });
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
  serverImport = null;
  uploadResult = deferred();
  // The accepted import replaces the cached query, as `upsertQueryData` does.
  start.mockImplementation(async () => {
    serverImport = currentImport;
    return { funder_import: currentImport };
  });
  discard.mockImplementation(async ({ importId }) => {
    if (serverImport?.import_id === importId) serverImport = null;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("starts the import as soon as the file is uploaded and follows its stage", async () => {
  await upload();
  expect(startImport).toHaveBeenCalledWith({
    runId: "run",
    uploadId: "upload-1",
  });
  expect(dispatch).toHaveBeenCalledWith({ funder_import: currentImport });
  await render();
  expect(flow.phase).toBe("converting");
  serverImport = { ...currentImport, stage: "reading" };
  await render();
  expect(flow.phase).toBe("reading");
});

it("does not start an import for a late upload after discard", async () => {
  let pending!: Promise<void>;
  await act(async () => {
    pending = flow.uploadFile(new File(["pdf"], "call.pdf"));
  });
  expect(flow.phase).toBe("uploading");
  await act(async () => flow.discard());
  await act(async () => {
    uploadResult.resolve({ uploadId: "upload-1" });
    await pending;
  });
  expect(flow.phase).toBe("idle");
  expect(startImport).not.toHaveBeenCalled();
});

it("discards only the late accepted import when cancelled during POST", async () => {
  const accepted = deferred<ConceptNoteFunderImportResponse>();
  start.mockReturnValue(accepted.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = flow.uploadFile(new File(["pdf"], "call.pdf"));
    uploadResult.resolve({ uploadId: "upload-1" });
  });
  expect(startImport).toHaveBeenCalledTimes(1);
  await act(async () => flow.discard());
  await act(async () => {
    accepted.resolve({ funder_import: currentImport });
    await pending;
  });
  expect(discardImport).toHaveBeenCalledWith({
    runId: "run",
    importId: "import-1",
  });
  expect(dispatch).not.toHaveBeenCalled();
  expect(flow.phase).toBe("idle");
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
  expect(startImport).toHaveBeenCalledTimes(1);
  expect(startImport).toHaveBeenCalledWith({
    runId: "run",
    uploadId: "upload-1",
  });
  await render();
  expect(flow.filename).toBe("call.pdf");
});

it("keeps a failed start retryable on the same upload", async () => {
  start.mockRejectedValueOnce({
    data: { detail: { code: "funder_import_running" } },
  });
  await upload();
  expect(flow.phase).toBe("failed");
  expect(flow.error).toBe("funder-error-import-running");
  await act(async () => flow.retry());
  expect(startImport).toHaveBeenCalledTimes(2);
  expect(startImport).toHaveBeenLastCalledWith({
    runId: "run",
    uploadId: "upload-1",
  });
  await render();
  expect(flow.phase).toBe("converting");
});

it("retries the conversion before restarting an import whose upload failed", async () => {
  serverImport = {
    ...currentImport,
    status: "failed",
    error_code: "upload_failed",
  };
  await render();
  expect(flow.phase).toBe("failed");
  expect(flow.error).toBe("funder-upload-failed");
  await act(async () => flow.retry());
  expect(retryUpload).toHaveBeenCalledWith({
    runId: "run",
    uploadId: "upload-1",
  });
  expect(startImport).toHaveBeenCalledWith({
    runId: "run",
    uploadId: "upload-1",
  });
});

it("keeps the server import visible when discard fails", async () => {
  serverImport = currentImport;
  discard.mockRejectedValue(new Error("unavailable"));
  await render();
  await act(async () => {
    await expect(flow.discard()).rejects.toThrow("unavailable");
  });
  expect(flow.phase).toBe("converting");
});

it("forgets browser-only progress when switching to another note", async () => {
  start.mockRejectedValueOnce({ status: 500 });
  await upload();
  expect(flow.phase).toBe("failed");
  await render("other-run");
  expect(flow.phase).toBe("idle");
});
