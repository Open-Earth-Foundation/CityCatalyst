/** @jest-environment jsdom */
import { expect, it, jest } from "@jest/globals";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ConceptNoteRun, ConceptNoteDraftState } from "@/util/types";
let draft: Pick<ConceptNoteDraftState, "chapters"> | undefined;
jest.unstable_mockModule("@/services/api", () => ({
  api: { useGetConceptNoteDraftQuery: () => ({ currentData: draft }) },
}));
it("uses compact rows, gates secondary export on real draft content and keeps Delete in the action menu", async () => {
  const originalCSS = globalThis.CSS;
  globalThis.CSS ??= {
    escape: (value: string) =>
      value.replace(
        /[^a-zA-Z0-9_-]/g,
        (char) => String.fromCharCode(92) + char,
      ),
  } as typeof CSS;
  const original = globalThis.structuredClone;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const { RunCard } =
    await import("@/components/ConceptNoteDashboard/run-card");
  const run = {
    run_id: "run",
    name: "City application",
    status: "in_progress",
    workflow_step: "interviewing",
    progress_summary: { draft_document: { status: "complete" } },
    initial_uploads: [],
  } as unknown as ConceptNoteRun;
  const onExport = jest.fn(),
    onDelete = jest.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  async function render() {
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <RunCard
            run={run}
            t={((key: string) => key) as never}
            activityLabel="Gathering information"
            scopeLabel="City · No funder"
            duplicateLoading={false}
            lifecycleDisabled={false}
            onRetryUpload={() => {}}
            onRename={() => {}}
            onDuplicate={() => {}}
            onExport={onExport}
            onDelete={onDelete}
            reducedMotion
            resumeHref="/en/note"
            uploading={false}
          />
        </ChakraProvider>,
      ),
    );
  }
  try {
    await render();
    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.getAttribute("aria-label") === label,
      )!;
    expect(button("export: City application").disabled).toBe(true);
    expect(container.textContent).not.toContain("30%");
    expect(container.querySelector('[role="menuitem"]')).toBeNull();
    draft = {
      chapters: [
        { body_markdown: "Draft text" },
      ] as ConceptNoteDraftState["chapters"],
    };
    await render();
    expect(button("export: City application").disabled).toBe(false);
    await act(async () => button("export: City application").click());
    expect(onExport).toHaveBeenCalledTimes(1);
    await act(async () => {
      button("workspace-more-actions: City application").focus();
      button("workspace-more-actions: City application").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(
      button("workspace-more-actions: City application").getAttribute(
        "aria-expanded",
      ),
    ).toBe("true");
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "delete");
    expect(item).toBeDefined();
    await act(async () => item!.click());
    expect(onDelete).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await act(async () =>
      button("workspace-more-actions: City application").focus(),
    );
    await act(async () =>
      button("workspace-more-actions: City application").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(
      button("workspace-more-actions: City application").getAttribute(
        "aria-expanded",
      ),
    ).toBe("true");
    await act(async () =>
      document
        .querySelector('[role="menu"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(
      button("workspace-more-actions: City application").getAttribute(
        "aria-expanded",
      ),
    ).toBe("false");
    expect(document.activeElement).toBe(
      button("workspace-more-actions: City application"),
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.structuredClone = original;
    globalThis.CSS = originalCSS;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  }
});
