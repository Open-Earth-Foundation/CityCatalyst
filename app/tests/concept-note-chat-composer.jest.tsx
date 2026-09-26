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
import { LuInfo } from "react-icons/lu";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import type { EditController } from "@/components/ConceptNoteWorkspace/document-review";

const sendMessage = jest.fn<(content: string) => Promise<void>>();
let isGenerating = false;

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-chat",
  () => ({
    useConceptNoteChat: () => ({
      error: null,
      historyLoading: false,
      isGenerating,
      progress: null,
      reasoning: "",
      messages: [],
      sendMessage,
      requestDraftOverview: jest.fn(),
    }),
  }),
);
// Composer behavior only; the surrounding chat surfaces are out of scope.
for (const [path, name] of [
  ["chat-suggestions", "ChatSuggestions"],
  ["chat-progress", "ChatProgress"],
  ["drafting-progress-card", "DraftingProgressCard"],
  ["chat-welcome", "ChatWelcome"],
]) {
  jest.unstable_mockModule(`@/components/ConceptNoteWorkspace/${path}`, () => ({
    [name]: () => null,
  }));
}
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/chat-threads",
  () => ({
    ChatThreadSwitcher: () => null,
    OlderChatNotice: () => null,
    useConceptNoteChatThreads: () => ({}),
  }),
);

let ConceptNoteChatPanel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
let root: Root;
let container: HTMLDivElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalStructuredClone = globalThis.structuredClone;

const contextStatus = {
  state: "none",
  blocked: false,
  title: "",
  description: "",
  icon: LuInfo,
  actionIcon: LuInfo,
  actionLabel: "",
  color: "content.secondary",
  surface: "base.light",
} as unknown as ConceptNoteContextPresentation;
const edits = {
  error: null,
  loadProposal: jest.fn(),
  refresh: jest.fn(),
} as unknown as EditController;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ ConceptNoteChatPanel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  isGenerating = false;
  sendMessage.mockReset();
  sendMessage.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderPanel(): Promise<void> {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteChatPanel
          contextStatus={contextStatus}
          composerRequest={null}
          draftOverviewPending={false}
          lng="en"
          onOpenContext={() => {}}
          runId="run"
          threadId="thread"
          editScope={{ kind: "document" } as never}
          edits={edits}
        />
      </ChakraProvider>,
    );
  });
}

function composer(): HTMLTextAreaElement {
  const element = container.querySelector<HTMLTextAreaElement>(
    '[data-testid="concept-note-chat-input"]',
  );
  expect(element?.tagName).toBe("TEXTAREA");
  return element!;
}

async function type(value: string): Promise<void> {
  const element = composer();
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressEnter(shiftKey = false): Promise<void> {
  await act(async () => {
    composer().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

it("keeps the composer editable while Clima responds but holds the send", async () => {
  isGenerating = true;
  await renderPanel();

  expect(composer().disabled).toBe(false);
  await type("Draft my next question");
  await pressEnter();

  expect(sendMessage).not.toHaveBeenCalled();
  expect(composer().value).toBe("Draft my next question");
  const send = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chat-send"]',
  );
  expect(send?.disabled).toBe(true);

  // Once the reply finishes, Enter sends the text typed during generation.
  isGenerating = false;
  await renderPanel();
  await pressEnter();

  expect(sendMessage).toHaveBeenCalledWith("Draft my next question");
  expect(composer().value).toBe("");
});

it("adds a new line on Shift+Enter instead of sending", async () => {
  await renderPanel();
  await type("First line");
  await pressEnter(true);

  expect(sendMessage).not.toHaveBeenCalled();

  await type("First line\nSecond line");
  await pressEnter();

  expect(sendMessage).toHaveBeenCalledWith("First line\nSecond line");
});
