/** @jest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ConceptNoteUploadResponse } from "@/util/types";

const share = jest.fn<(body: unknown) => void>();
let shared = false;
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetConceptNoteUploadStatusQuery: () => ({
      currentData: { documentId: "document-1", visibility: "run" },
    }),
  },
}));
jest.unstable_mockModule("@/services/document-workspace-api", () => ({
  documentWorkspaceApi: {
    useShareWorkspaceDocumentMutation: () => [
      (body: unknown) => {
        share(body);
        shared = true;
      },
      {
        data: shared
          ? { data: { documentId: "document-1", visibility: "city" } }
          : undefined,
      },
    ],
  },
}));
let UploadSharingButton: typeof import("@/components/ConceptNoteWorkspace/upload-sharing-button").UploadSharingButton;
let root: Root;
let container: HTMLDivElement;
const originalClone = globalThis.structuredClone;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ UploadSharingButton } =
    await import("@/components/ConceptNoteWorkspace/upload-sharing-button"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
});
beforeEach(() => {
  share.mockClear();
  shared = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(
  upload: ConceptNoteUploadResponse = {
    uploadId: "upload-1",
    status: "ready",
    filename: "budget.pdf",
  },
) {
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <UploadSharingButton upload={upload} runId="run-1" lng="en" />
      </ChakraProvider>,
    ),
  );
}
it("shares only on explicit user action and uses the linked pool document", async () => {
  await render();
  expect(share).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(share).toHaveBeenCalledWith({
    runId: "run-1",
    uploadId: "upload-1",
    documentId: "document-1",
  });
  await render();
  expect(container.querySelector("button")).toBeNull();
  expect(container.textContent).toContain("workspace-source-city-shared");
});
