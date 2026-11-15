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
import translations from "@/i18n/locales/en/concept-notes.json";
import type {
  DocumentWorkspace,
  DocumentWorkspacePoint,
} from "@/util/document-workspace";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));
let ChatWelcome: typeof import("@/components/ConceptNoteWorkspace/chat-welcome").ChatWelcome;
let getChatWelcomeStage: typeof import("@/components/ConceptNoteWorkspace/chat-welcome").getChatWelcomeStage;
let root: Root;
let container: HTMLDivElement;
const originalClone = globalThis.structuredClone;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ ChatWelcome, getChatWelcomeStage } =
    await import("@/components/ConceptNoteWorkspace/chat-welcome"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const workspace = (
  points: Array<Pick<DocumentWorkspacePoint, "required" | "status">>,
) => ({ setup: { ready: true }, points }) as DocumentWorkspace;

it("guides unresolved required work and conflicts to information gathering before prose", () => {
  for (const status of ["missing", "needs_confirmation", "conflict"] as const)
    expect(
      getChatWelcomeStage({
        draftHasContent: false,
        canStartDrafting: true,
        workspace: workspace([{ required: true, status }]),
      }),
    ).toBe("gather-points");
  expect(
    getChatWelcomeStage({
      draftHasContent: false,
      canStartDrafting: true,
      workspace: workspace([{ required: false, status: "conflict" }]),
    }),
  ).toBe("gather-points");
});
it("retains drafting guidance once required points are covered and existing draft behavior", () => {
  expect(
    getChatWelcomeStage({
      draftHasContent: false,
      canStartDrafting: true,
      workspace: workspace([
        { required: true, status: "answered" },
        { required: false, status: "missing" },
      ]),
    }),
  ).toBe("ready-to-draft");
  expect(
    getChatWelcomeStage({
      draftHasContent: true,
      canStartDrafting: true,
      workspace: workspace([{ required: true, status: "missing" }]),
    }),
  ).toBe("drafted");
  expect(
    getChatWelcomeStage({ draftHasContent: false, canStartDrafting: false }),
  ).toBe("choose-funding");
});
it("explains evidence and decisions, opens To do and keeps working drafts discoverable", async () => {
  const todos = jest.fn();
  const draft = jest.fn();
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ChatWelcome
          lng="en"
          stage="gather-points"
          onOpenTodos={todos}
          onOpenDraft={draft}
        />
      </ChakraProvider>,
    ),
  );
  expect(container.textContent).toContain(
    translations["chat-welcome-info-first-intro"],
  );
  expect(container.textContent).toContain(
    translations["chat-welcome-gather-points"],
  );
  expect(container.textContent).not.toContain(
    translations["chat-welcome-intro"],
  );
  expect(container.textContent).not.toContain(
    translations["chat-welcome-ready-to-draft"],
  );
  const button = container.querySelector("button")!;
  expect(button.textContent).toBe(translations["chat-welcome-open-todos"]);
  await act(async () => button.click());
  expect(todos).toHaveBeenCalledTimes(1);
  expect(draft).not.toHaveBeenCalled();
});
