/** @jest-environment jsdom */
import { expect, it, jest } from "@jest/globals";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type {
  DocumentWorkspace,
  DocumentWorkspaceNeed,
} from "@/util/document-workspace";
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/services/document-workspace-api", () => ({
  documentWorkspaceApi: {
    useGetWorkspaceDocumentsQuery: () => ({}),
    useAttachWorkspaceDocumentMutation: () => [jest.fn(), {}],
  },
}));
it("shows required evidence first, hides repeated descriptions and explains point links", async () => {
  const original = globalThis.structuredClone;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { WorkspaceSources } =
    await import("@/components/ConceptNoteWorkspace/workspace-source-picker");
  const need: DocumentWorkspaceNeed = {
    need_id: "optional",
    key: "optional",
    label: "Optional letter",
    description: "Optional letter",
    required: false,
    status: "missing",
    point_keys: ["cost"],
    guidance: "",
    documents: [],
  };
  const workspace = {
    needs: [
      need,
      {
        ...need,
        need_id: "required",
        key: "required",
        label: "Financing plan",
        description: "Financing plan",
        required: true,
        status: "available",
      },
    ],
    points: [{ key: "cost", label: "Grant amount" }],
  } as DocumentWorkspace;
  const selected = jest.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <WorkspaceSources
            runId="run"
            lng="en"
            workspace={workspace}
            onAttached={() => {}}
            onAddSource={() => {}}
            onSelectPoint={selected}
          />
        </ChakraProvider>,
      ),
    );
    const needs = [
      ...container.querySelectorAll('[data-testid="workspace-evidence-need"]'),
    ];
    expect(needs[0].textContent).toContain("Financing plan");
    expect(needs[0].textContent?.match(/Financing plan/g)).toHaveLength(1);
    expect(needs[0].textContent).toContain("workspace-need-available");
    expect(needs[1].textContent).toContain("workspace-need-missing");
    expect(needs[0].textContent).toContain("workspace-used-for");
    const link = [...needs[0].querySelectorAll("button")].find(
      (button) => button.textContent === "Grant amount",
    );
    await act(async () => link!.click());
    expect(selected).toHaveBeenCalledWith("cost");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.structuredClone = original;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  }
});
