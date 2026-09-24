/** @jest-environment jsdom */

import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LuDatabase } from "react-icons/lu";

import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type {
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
} from "@/util/types";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));

jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-chat",
  () => ({
    useConceptNoteChat: () => ({
      error: null,
      historyLoading: false,
      isGenerating: false,
      reasoning: null,
      progress: null,
      messages: [],
      sendMessage: jest.fn(),
      requestDraftOverview: jest.fn(),
    }),
  }),
);

let ConceptNoteChatPanel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
let root: Root;
let container: HTMLDivElement;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  HTMLElement.prototype.scrollTo = jest.fn();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  ({ ConceptNoteChatPanel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function draftWith(
  regenerationStatus: ConceptNoteDraftChapter["regeneration_status"],
): ConceptNoteDraftState {
  return {
    focused_gap_id: null,
    chapters: [
      {
        chapter_id: "chapter-1",
        title: "Financing plan",
        position: 0,
        status: "draft",
        gaps: [],
        open_gap_count: 0,
        caveat_count: 0,
        regeneration_status: regenerationStatus,
      },
    ],
  } as unknown as ConceptNoteDraftState;
}

async function renderPanel(draft: ConceptNoteDraftState): Promise<void> {
  const props = {
    contextStatus: {
      state: "ready",
      blocked: false,
      busy: false,
      title: "Context ready",
      description: "Ready",
      icon: LuDatabase,
      color: "sentiment.positiveDefault",
      surface: "sentiment.positiveOverlay",
      actionIcon: LuDatabase,
      actionLabel: "Review",
    },
    composerRequest: null,
    draftOverviewPending: false,
    lng: "en",
    onOpenContext: jest.fn(),
    runId: "run-1",
    threadId: "thread-1",
    editScope: { kind: "auto" },
    edits: { loadProposal: jest.fn(), error: null, refresh: jest.fn() },
    draft,
  } as unknown as ComponentProps<typeof ConceptNoteChatPanel>;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ChakraProvider value={appTheme}>
        <ConceptNoteChatPanel {...props} />
      </ChakraProvider>,
    );
  });
}

function chatInput(): HTMLInputElement {
  return container.querySelector(
    '[data-testid="concept-note-chat-input"]',
  ) as HTMLInputElement;
}

it.each(["queued", "processing"] as const)(
  "holds chat while a chapter is %s",
  async (status) => {
    await renderPanel(draftWith(status));

    expect(chatInput().disabled).toBe(true);
    expect(chatInput().placeholder).toBe(
      translations["chat-waiting-for-chapter-updates"],
    );
    expect(
      container.querySelector('[data-testid="concept-note-chat-updating"]'),
    ).not.toBeNull();
  },
);

it("keeps chat available when no chapter is being updated", async () => {
  await renderPanel(draftWith("idle"));

  expect(chatInput().disabled).toBe(false);
  expect(
    container.querySelector('[data-testid="concept-note-chat-updating"]'),
  ).toBeNull();
});
