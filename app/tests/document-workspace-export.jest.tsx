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
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DocumentWorkspace } from "@/util/document-workspace";

const request = jest.fn<(body: unknown) => void>();
const renderSnapshot = jest.fn<(...args: unknown[]) => Promise<void>>();
let rejectSnapshot = false;
let exportError: { status: number; data?: { title: string } } | undefined;
const reloadWorkspace = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/services/document-workspace-api", () => ({
  documentWorkspaceApi: {
    useExportDocumentWorkspaceMutation: () => [
      (body: unknown) => {
        request(body);
        return {
          unwrap: async () => {
            if (rejectSnapshot) throw new Error("Stale");
            return {
              body_markdown: "# Server-authorized content",
              caveats: [],
              workspace_revision: 12,
            };
          },
        };
      },
      {
        isError: Boolean(exportError),
        error: exportError,
        reset: () => {
          exportError = undefined;
        },
      },
    ],
  },
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/concept-note-export",
  () => ({ exportConceptNoteMarkdown: renderSnapshot }),
);
let WorkspaceExport: typeof import("@/components/ConceptNoteWorkspace/workspace-export").WorkspaceExport;
let root: Root;
let container: HTMLDivElement;
const originalClone = globalThis.structuredClone;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ WorkspaceExport } =
    await import("@/components/ConceptNoteWorkspace/workspace-export"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
});
beforeEach(() => {
  rejectSnapshot = false;
  exportError = undefined;
  reloadWorkspace.mockReset().mockResolvedValue(undefined);
  request.mockClear();
  renderSnapshot.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(final = false, refreshing = false) {
  const workspace = {
    revision: 12,
    export_eligibility: {
      working: true,
      final,
      blockers: ["Required budget unanswered"],
      workspace_revision: 12,
    },
  } as DocumentWorkspace;
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <WorkspaceExport
          workspace={workspace}
          runId="run-1"
          noteName="City proposal"
          lng="en"
          onReload={reloadWorkspace}
          refreshing={refreshing}
        />
      </ChakraProvider>,
    ),
  );
}
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  )!;
it("waits for workspace reconciliation before exporting its cached revision", async () => {
  await render(true, true);
  expect(button("workspace-export-working").disabled).toBe(true);
  expect(button("workspace-export-final").disabled).toBe(true);
  await act(async () => button("workspace-export-final").click());
  expect(request).not.toHaveBeenCalled();
  await render(true, false);
  expect(button("workspace-export-final").disabled).toBe(false);
});
it("keeps final export disabled while unresolved points remain", async () => {
  await render();
  expect(button("workspace-export-final").disabled).toBe(true);
  expect(container.textContent).toContain("Required budget unanswered");
  expect(button("workspace-export-working").disabled).toBe(false);
});
it("exports the server markdown at the current expected revision", async () => {
  await render(true);
  await act(async () => button("workspace-export-final").click());
  expect(request).toHaveBeenCalledWith({
    runId: "run-1",
    mode: "final",
    expected_revision: 12,
  });
  expect(renderSnapshot).toHaveBeenCalledWith(
    "docx",
    "City proposal",
    "# Server-authorized content",
    "en",
  );
});
it("does not produce a download when server eligibility or revision rejects export", async () => {
  rejectSnapshot = true;
  await render(true);
  await act(async () => button("workspace-export-final").click());
  expect(renderSnapshot).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "workspace-export-error",
  );
});

it("provides explicit reload after a stale export and permits a reviewed retry", async () => {
  exportError = { status: 409 };
  await render(true);
  expect(button("workspace-reload")).toBeDefined();
  await act(async () => button("workspace-reload").click());
  expect(reloadWorkspace).toHaveBeenCalledTimes(1);
  await render(true);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async () => button("workspace-export-final").click());
  expect(renderSnapshot).toHaveBeenCalledTimes(1);
});

it("explains unavailable evidence instead of suggesting that revision reload fixes it", async () => {
  exportError = {
    status: 409,
    data: {
      title:
        "A supporting source is unavailable or changed. Review the source-backed answer.",
    },
  };
  await render(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "workspace-source-unavailable-error",
  );
  expect(button("workspace-reload")).toBeUndefined();
  expect(reloadWorkspace).not.toHaveBeenCalled();
});
