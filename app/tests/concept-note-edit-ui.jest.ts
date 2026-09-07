/** @jest-environment jsdom */
import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { act, createElement, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import type { ConceptNoteGap } from "@/util/types";
import {
  chapterId,
  cleanup,
  draftChapter,
  mount,
  prepareDom,
  proposal,
  runId,
  t,
} from "./cnb-edit-ui-helpers";

prepareDom();
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
// Exercise real disclosure/focus behavior; jsdom cannot position an overlay.
jest.unstable_mockModule("@/components/ui/popover", async () => {
  const { Popover, Portal } = await import("@chakra-ui/react");
  return {
    PopoverRoot: Popover.Root,
    PopoverTrigger: Popover.Trigger,
    PopoverBody: Popover.Body,
    PopoverContent: (props: ComponentProps<typeof Popover.Content>) =>
      createElement(Portal, null, createElement(Popover.Content, props)),
  };
});
let Card: typeof import("@/components/ConceptNoteWorkspace/edit-proposal-card").EditProposalCard;
let ChatPanel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
type CardProps = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/edit-proposal-card").EditProposalCard
>;
const editState = {
  proposals: [proposal],
  busy: null,
  error: null,
  loadProposal: jest.fn(),
  apply: jest.fn(),
  reject: jest.fn(),
};
const chatState = {
  error: null,
  historyLoading: false,
  isGenerating: false,
  messages: [],
  sendMessage: jest.fn(),
};
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-edits",
  () => ({ useConceptNoteEdits: () => editState }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-chat",
  () => ({ useConceptNoteChat: () => chatState }),
);
let root: Root;
beforeAll(async () => {
  ({ EditProposalCard: Card } =
    await import("@/components/ConceptNoteWorkspace/edit-proposal-card"));
  ({ ConceptNoteChatPanel: ChatPanel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});
afterEach(async () => {
  await cleanup(root);
  Object.assign(chatState, { isGenerating: false, messages: [] });
  jest.restoreAllMocks();
});

async function card(overrides: Record<string, unknown> = {}) {
  const onApply = jest.fn<CardProps["onApply"]>().mockResolvedValue(undefined);
  const onReject = jest
    .fn<CardProps["onReject"]>()
    .mockResolvedValue(undefined);
  const onNavigate = jest.fn();
  const result = await mount(
    createElement(Card, {
      proposal,
      lng: "en",
      busy: false,
      onApply,
      onReject,
      onNavigate,
      ...overrides,
    }),
    true,
  );
  root = result.root;
  return { ...result, onApply, onReject, onNavigate };
}

it("makes Apply all and Reject all explicit primary review actions", async () => {
  const { container, onApply, onReject } = await card();
  const apply = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-edit-apply-all"]',
  )!;
  const reject = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-edit-reject-all"]',
  )!;
  expect(apply.textContent).toBe("Accept all");
  expect(reject.textContent).toBe("Reject all");
  await act(async () => apply.click());
  expect(onApply).toHaveBeenCalledWith(proposal);
  expect(onReject).not.toHaveBeenCalled();
  await act(async () => reject.click());
  expect(onReject).toHaveBeenCalledWith(proposal);
});

it("labels user-supplied facts without blocking acceptance or claiming source verification", async () => {
  const supplied = {
    ...proposal,
    changes: proposal.changes.map((change) => ({
      ...change,
      kind: "factual",
      user_input_quote: "The budget is EUR 12 million.",
      source_refs: [],
    })),
  };
  const { container } = await card({ proposal: supplied });
  expect(
    container.querySelector('[data-testid="concept-note-user-facts-notice"]')
      ?.textContent,
  ).toContain("not been independently verified");
  expect(
    container.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-edit-apply-all"]',
    )!.disabled,
  ).toBe(false);
});

it("disables acceptance during an in-flight operation", async () => {
  const { container, onApply } = await card({ busy: true });
  const button = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-edit-apply-all"]',
  )!;
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(onApply).not.toHaveBeenCalled();
});
it("navigates every changed location with labelled previous/next buttons", async () => {
  const second = {
    ...proposal.changes[0],
    change_id: "55555555-5555-4555-8555-555555555555",
    chapter_title: "Delivery",
    chapter_id: "66666666-6666-4666-8666-666666666666",
    before: "Old delivery",
    after: "Clear delivery",
  };
  const { container, onNavigate } = await card({
    proposal: { ...proposal, changes: [...proposal.changes, second] },
  });
  const previous = container.querySelector<HTMLButtonElement>(
    '[aria-label="Previous change"]',
  )!;
  const next = container.querySelector<HTMLButtonElement>(
    '[aria-label="Next change"]',
  )!;
  expect(previous.disabled).toBe(true);
  await act(async () => next.click());
  expect(container.textContent).toContain("2 of 2");
  expect(container.querySelector("ins")).toBeNull();
  expect(onNavigate).toHaveBeenCalledWith(second.chapter_id, second.change_id);
  expect(next.disabled).toBe(true);
  await act(async () => previous.click());
  expect(onNavigate).toHaveBeenLastCalledWith(
    proposal.changes[0].chapter_id,
    proposal.changes[0].change_id,
  );
});
it("never offers apply for failed, rejected or stale proposals", async () => {
  const { container } = await card({
    proposal: { ...proposal, status: "stale", error_code: "stale_base" },
  });
  expect(
    container.querySelector('[data-testid="concept-note-edit-apply-all"]'),
  ).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "The draft changed",
  );
});
it("keeps the toolbar counter aligned with the document's controlled active hunk", async () => {
  const second = { ...proposal.changes[0], change_id: "second" };
  const { container } = await card({
    proposal: { ...proposal, changes: [...proposal.changes, second] },
    activeChangeId: "second",
  });
  expect(container.textContent).toContain("2 of 2");
  expect(
    container.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-edit-next"]',
    )!.disabled,
  ).toBe(true);
});
it("shows focused clarification and allows processing cancellation", async () => {
  const { container, onReject } = await card({
    proposal: {
      ...proposal,
      status: "processing",
      changes: [],
      clarification: "Which chapter?",
    },
  });
  expect(container.textContent).toContain("Which chapter?");
  const cancel = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-edit-cancel"]',
  )!;
  await act(async () => cancel.click());
  expect(onReject).toHaveBeenCalled();
});

it("never renders edit proposals in the chat pane", async () => {
  const props = {
    lng: "en",
    bundleStatus: "ready",
    documentGrounding: "none" as const,
    draft: null,
    isConfirmingChapter: false,
    isResolvingGap: false,
    mutationError: null,
    onConfirmChapter: async () => {},
    onOpenContext: () => {},
    onReviewDraft: () => {},
    onResolveGap: async () => {},
    onStopGapInterview: () => {},
    reviewGapChapterId: null,
    reviewGapId: null,
    threadId: "thread",
    editScope: proposal.scope,
    edits: editState as unknown as ComponentProps<typeof ChatPanel>["edits"],
  };
  const rendered = await mount(createElement(ChatPanel, props), true);
  root = rendered.root;
  expect(
    rendered.container.querySelector('[data-testid="concept-note-edit-scope"]'),
  ).toBeNull();
  expect(rendered.container.querySelector("[data-proposal-id]")).toBeNull();
  expect(rendered.container.textContent).not.toContain(
    "The proposal could not be prepared",
  );
});

it("shows the standard three-dot indicator for an empty assistant response", async () => {
  Object.assign(chatState, {
    isGenerating: true,
    messages: [{ id: "thinking", role: "assistant", text: "" }],
  });
  const rendered = await mount(
    createElement(ChatPanel, {
      lng: "en",
      bundleStatus: "ready",
      documentGrounding: "none",
      draft: null,
      isConfirmingChapter: false,
      isResolvingGap: false,
      mutationError: null,
      onConfirmChapter: async () => {},
      onOpenContext: () => {},
      onReviewDraft: () => {},
      onResolveGap: async () => {},
      onStopGapInterview: () => {},
      reviewGapChapterId: null,
      reviewGapId: null,
      threadId: "thread",
      editScope: proposal.scope,
      edits: editState as unknown as ComponentProps<typeof ChatPanel>["edits"],
    }),
    true,
  );
  root = rendered.root;
  const indicator = rendered.container.querySelector(
    '[data-testid="concept-note-typing-indicator"]',
  );
  expect(indicator?.getAttribute("role")).toBe("status");
  expect(indicator?.getAttribute("aria-label")).toBe("Generating response");
  expect(
    indicator?.querySelectorAll('[data-testid="concept-note-typing-dot"]'),
  ).toHaveLength(3);
  expect(rendered.container.textContent).not.toContain("chat-thinking");
});

it("does not expose revision history in the chat workspace", async () => {
  const rendered = await mount(
    createElement(ChatPanel, {
      lng: "en",
      bundleStatus: "ready",
      documentGrounding: "none",
      draft: {
        run_id: runId,
        status: "complete",
        completed_chapters: 1,
        total_chapters: 1,
        current_chapter_id: null,
        focused_gap_id: null,
        error_code: null,
        chapters: [draftChapter()],
      },
      isConfirmingChapter: false,
      isResolvingGap: false,
      mutationError: null,
      onConfirmChapter: async () => {},
      onOpenContext: () => {},
      onReviewDraft: () => {},
      onResolveGap: async () => {},
      onStopGapInterview: () => {},
      reviewGapChapterId: null,
      reviewGapId: null,
      threadId: "thread",
      editScope: proposal.scope,
      edits: {
        ...editState,
      } as unknown as ComponentProps<typeof ChatPanel>["edits"],
    }),
    true,
  );
  root = rendered.root;
  expect(
    rendered.container.querySelector(
      '[data-testid="concept-note-history-toggle"]',
    ),
  ).toBeNull();
  expect(rendered.container.textContent).not.toContain("Revision history");
  expect(rendered.container.textContent).not.toContain(
    "History could not be loaded",
  );
  expect(rendered.container.textContent).not.toContain(
    "Ask a question or request an edit. Changes wait for your review.",
  );
  expect(
    rendered.container.querySelector('[data-testid="concept-note-chat-input"]'),
  ).not.toBeNull();
});

it("keeps the workspace usable when a runtime chapter omits its gaps", async () => {
  const malformedChapter = {
    ...draftChapter(),
    gaps: undefined,
  } as unknown as ReturnType<typeof draftChapter>;
  const rendered = await mount(
    createElement(ChatPanel, {
      lng: "en",
      bundleStatus: "ready",
      documentGrounding: "none",
      draft: {
        run_id: runId,
        status: "complete",
        completed_chapters: 1,
        total_chapters: 1,
        current_chapter_id: null,
        focused_gap_id: null,
        error_code: null,
        chapters: [malformedChapter],
      },
      isConfirmingChapter: false,
      isResolvingGap: false,
      mutationError: null,
      onConfirmChapter: async () => {},
      onOpenContext: () => {},
      onReviewDraft: () => {},
      onResolveGap: async () => {},
      onStopGapInterview: () => {},
      reviewGapChapterId: null,
      reviewGapId: null,
      threadId: "thread",
      editScope: proposal.scope,
      edits: editState as unknown as ComponentProps<typeof ChatPanel>["edits"],
    }),
    true,
  );
  root = rendered.root;
  expect(
    rendered.container.querySelector('[data-testid="concept-note-chat-input"]'),
  ).not.toBeNull();
});

it("stops the gap interview and returns to its summary without resolving a gap", async () => {
  const openGap: ConceptNoteGap = {
    gap_id: "88888888-8888-4888-8888-888888888888",
    field_key: "beneficiaries",
    question: "Who benefits from the project?",
    why_asking: "The application must identify its beneficiaries.",
    severity: "critical",
    state: "open",
    suggestions: [],
    source_refs: [],
    version: 1,
    resolution: null,
    created_at: "2026-09-03T12:00:00Z",
    updated_at: "2026-09-03T12:00:00Z",
  };
  const onStopGapInterview = jest.fn();
  const onResolveGap = jest
    .fn<ComponentProps<typeof ChatPanel>["onResolveGap"]>()
    .mockResolvedValue(undefined);
  const rendered = await mount(
    createElement(ChatPanel, {
      lng: "en",
      bundleStatus: "ready",
      documentGrounding: "none",
      draft: {
        run_id: runId,
        status: "complete",
        completed_chapters: 0,
        total_chapters: 1,
        current_chapter_id: chapterId,
        focused_gap_id: openGap.gap_id,
        error_code: null,
        chapters: [
          draftChapter({
            status: "needs_review",
            gaps: [openGap],
            open_gap_count: 1,
          }),
        ],
      },
      isConfirmingChapter: false,
      isResolvingGap: false,
      mutationError: null,
      onConfirmChapter: async () => {},
      onOpenContext: () => {},
      onReviewDraft: () => {},
      onResolveGap,
      onStopGapInterview,
      reviewGapChapterId: null,
      reviewGapId: null,
      threadId: "thread",
      editScope: proposal.scope,
      edits: editState as unknown as ComponentProps<typeof ChatPanel>["edits"],
    }),
    true,
  );
  root = rendered.root;

  expect(
    rendered.container.querySelector(
      '[data-testid="concept-note-gap-summary"]',
    ),
  ).not.toBeNull();
  await act(async () =>
    rendered.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-gap-start-interview"]',
      )!
      .click(),
  );
  expect(
    rendered.container.querySelector(
      '[data-testid="concept-note-focused-gap"]',
    ),
  ).not.toBeNull();

  await act(async () =>
    rendered.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-gap-stop-interview"]',
      )!
      .click(),
  );
  expect(onStopGapInterview).toHaveBeenCalledTimes(1);
  expect(onResolveGap).not.toHaveBeenCalled();
  expect(
    rendered.container.querySelector(
      '[data-testid="concept-note-gap-summary"]',
    ),
  ).not.toBeNull();
  expect(
    rendered.container.querySelector(
      '[data-testid="concept-note-focused-gap"]',
    ),
  ).toBeNull();
});

it("selects entire consistency groups and submits only those selected", async () => {
  const second = {
    ...proposal.changes[0],
    change_id: "55555555-5555-4555-8555-555555555555",
  };
  const independent = {
    ...proposal.changes[0],
    change_id: "66666666-6666-4666-8666-666666666666",
    group_id: "date",
  };
  const multi = {
    ...proposal,
    changes: [...proposal.changes, second, independent],
  };
  const { container, onApply } = await card({ proposal: multi });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-options"]',
      )!
      .click(),
  );
  expect(
    document.querySelector('[data-testid="concept-note-edit-current-group"]')
      ?.textContent,
  ).toBe("Group 1");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-next"]',
      )!
      .click(),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-next"]',
      )!
      .click(),
  );
  expect(
    document.querySelector('[data-testid="concept-note-edit-current-group"]')
      ?.textContent,
  ).toBe("Group 2");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-select-toggle"]',
      )!
      .click(),
  );
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    '[data-testid="concept-note-edit-group"]',
  );
  expect(checkboxes).toHaveLength(2);
  await act(async () => checkboxes[0].click());
  const selected = document.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-edit-apply-selected"]',
  )!;
  expect(selected.textContent).toBe("Apply selected (1)");
  await act(async () => selected.click());
  expect(onApply).toHaveBeenCalledWith(multi, [independent.change_id]);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-apply-all"]',
      )!
      .click(),
  );
  expect(onApply).toHaveBeenLastCalledWith(multi);
});
it("does not expose a manual broad-scope confirmation action", async () => {
  const onRefine = jest
    .fn<NonNullable<CardProps["onRefine"]>>()
    .mockResolvedValue(undefined);
  const broad = {
    ...proposal,
    status: "clarification_required",
    changes: [],
    clarification: "Which facts should stay unchanged?",
  };
  const { container } = await card({ proposal: broad, onRefine });
  expect(
    container.querySelector('[data-testid="concept-note-edit-confirm-broad"]'),
  ).toBeNull();
  expect(onRefine).not.toHaveBeenCalled();
});
it("keeps the original instruction editable for refinement and prevents an empty submit", async () => {
  const onRefine = jest
    .fn<NonNullable<CardProps["onRefine"]>>()
    .mockResolvedValue(undefined);
  const { container } = await card({ onRefine });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-options"]',
      )!
      .click(),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-refine-toggle"]',
      )!
      .click(),
  );
  const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
  expect(input.value).toBe(proposal.instruction);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "Make it concise and formal");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    document
      .querySelector<HTMLFormElement>("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(onRefine).toHaveBeenCalledWith(proposal, "Make it concise and formal");
});

it("keeps optional controls hidden until the explicit review options action", async () => {
  const rendered = await card();
  expect(
    document.querySelector('[data-testid="concept-note-review-details"]'),
  ).toBeNull();
  await act(async () =>
    rendered.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-edit-options"]',
      )!
      .click(),
  );
  expect(
    document.querySelector('[data-testid="concept-note-review-details"]'),
  ).not.toBeNull();
  expect(
    rendered.container.querySelector(
      '[data-testid="concept-note-review-details"]',
    ),
  ).toBeNull();
});
