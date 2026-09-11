/** @jest-environment jsdom */

import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import translations from "@/i18n/locales/en/concept-notes.json";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type {
  EditApplyRequest,
  EditProposal,
} from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";

const chapterId = "11111111-1111-4111-8111-111111111111";
const ids = [1, 2, 3].map((n) => `22222222-2222-4222-8222-22222222222${n}`);
const proposal: EditProposal = {
  proposal_id: "33333333-3333-4333-8333-333333333333",
  run_id: "run-1",
  instruction: "Improve wording",
  scope: { kind: "auto" },
  status: "proposed",
  base_revisions: { [chapterId]: 1 },
  changes: ids.map((id, index) => ({
    change_id: id,
    chapter_id: chapterId,
    chapter_title: "Budget",
    base_revision: 1,
    start: index * 2,
    before: "abc"[index],
    after: "ABC"[index],
    kind: "wording",
    group_id: id,
    source_refs: [],
    user_input_quote: null,
  })),
  clarification: null,
  error_code: null,
  result: null,
  created_at: "2026-09-11T12:00:00Z",
  updated_at: "2026-09-11T12:00:00Z",
};
const chapter = {
  chapter_id: chapterId,
  revision_number: 1,
  body_markdown: "a b c",
} as ConceptNoteDraftChapter;
let proposals: EditProposal[];
const applyRequest =
  jest.fn<(args: { body: EditApplyRequest }) => Promise<EditProposal>>();
const rejectRequest = jest.fn<() => Promise<EditProposal>>();
const onApplied = jest.fn<(chapterIds: string[]) => Promise<void>>();
const refresh = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));
jest.unstable_mockModule("@/lib/hooks", () => ({
  useAppDispatch: () => () => {},
}));
jest.unstable_mockModule("@/services/concept-note-edit-api", () => ({
  editErrorCode: () => "edit_request_failed",
  editApi: {
    endpoints: {
      listEditProposals: { useQueryState: () => ({ currentData: proposals }) },
    },
    useListEditProposalsQuery: () => ({
      currentData: proposals,
      refetch: () => ({ unwrap: refresh }),
    }),
    useLazyGetEditProposalQuery: () => [jest.fn()],
    useApplyEditProposalMutation: () => [
      (args: { body: EditApplyRequest }) => ({
        unwrap: () => applyRequest(args),
      }),
    ],
    useRejectEditProposalMutation: () => [() => ({ unwrap: rejectRequest })],
    useRefineEditProposalMutation: () => [jest.fn()],
    util: {
      updateQueryData: (
        _endpoint: string,
        _run: string,
        update: (items: EditProposal[]) => EditProposal[],
      ) => {
        proposals = update(proposals);
      },
    },
  },
}));

const { useConceptNoteEdits } =
  await import("@/components/ConceptNoteWorkspace/use-concept-note-edits");
const { useInlineReviewDecisions } =
  await import("@/components/ConceptNoteWorkspace/use-inline-review-decisions");
const { DocumentReviewToolbar, DocumentReviewFeedback, selectReviewProposal } =
  await import("@/components/ConceptNoteWorkspace/document-review");
let controller: ReturnType<typeof useConceptNoteEdits>;
let review: ReturnType<typeof useInlineReviewDecisions>;
let root: Root;
let container: HTMLDivElement;

function Harness({ runId = "run-1" }: { runId?: string }) {
  const edits = useConceptNoteEdits({ runId, onApplied });
  const active = selectReviewProposal(edits.proposals);
  const decisions = useInlineReviewDecisions(active, edits, () => {});
  useEffect(() => {
    controller = edits;
    review = decisions;
  });
  return (
    <ChakraProvider value={appTheme}>
      {active && (
        <DocumentReviewToolbar
          proposal={active}
          chapters={[chapter]}
          changes={active.changes}
          edits={edits}
          lng="en"
          onNavigate={() => {}}
          onOpenSources={() => {}}
          hasDecisions={Object.keys(decisions.decisions).length > 0}
          onAcceptRemaining={(p) => decisions.decideRemaining(p, "accepted")}
          onRejectRemaining={(p) => decisions.decideRemaining(p, "rejected")}
        />
      )}
      <DocumentReviewFeedback edits={edits} lng="en" />
    </ChakraProvider>
  );
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
});
beforeEach(async () => {
  proposals = [proposal];
  sessionStorage.clear();
  applyRequest.mockReset().mockImplementation(async ({ body }) => ({
    ...proposal,
    status: body.selected_change_ids ? "partially_applied" : "applied",
    result: {
      application_id: "application",
      accepted_change_ids: body.selected_change_ids ?? ids,
      revisions: { [chapterId]: 2 },
    },
  }));
  rejectRequest
    .mockReset()
    .mockResolvedValue({ ...proposal, status: "rejected" });
  onApplied.mockReset().mockResolvedValue();
  refresh.mockReset().mockResolvedValue();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  expect(button).toBeDefined();
  expect(button!.disabled).toBe(false);
  await act(async () => button!.click());
}

it("accepts remaining changes without applying a manually rejected change", async () => {
  await act(async () => review.decide(proposal, [ids[0]], "rejected"));
  await act(async () => review.decide(proposal, [ids[1]], "accepted"));
  expect(applyRequest).not.toHaveBeenCalled();
  await click("Accept remaining");
  expect(applyRequest.mock.calls[0][0].body.selected_change_ids).toEqual([
    ids[1],
    ids[2],
  ]);
  expect(rejectRequest).not.toHaveBeenCalled();
  expect(review.decisions).toEqual({});
});

it("rejects remaining changes while saving manually accepted changes", async () => {
  await act(async () => review.decide(proposal, [ids[0]], "accepted"));
  await click("Reject remaining");
  expect(applyRequest.mock.calls[0][0].body.selected_change_ids).toEqual([
    ids[0],
  ]);
  expect(rejectRequest).not.toHaveBeenCalled();
});

it("rejects the proposal if every change is rejected", async () => {
  await act(async () => review.decide(proposal, [ids[0]], "rejected"));
  await click("Reject remaining");
  expect(rejectRequest).toHaveBeenCalledTimes(1);
  expect(applyRequest).not.toHaveBeenCalled();
});

it("still accepts all when no individual decision has been made", async () => {
  await click("Accept all");
  expect(
    applyRequest.mock.calls[0][0].body.selected_change_ids,
  ).toBeUndefined();
  expect(onApplied).toHaveBeenCalledWith([chapterId]);
});

it("preserves choices and the idempotency key after a failed bulk submission", async () => {
  applyRequest.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => review.decide(proposal, [ids[0]], "rejected"));
  await click("Accept remaining");
  expect(review.decisions).toEqual({
    [ids[0]]: "rejected",
    [ids[1]]: "accepted",
    [ids[2]]: "accepted",
  });
  expect(
    container.querySelector(
      '[data-testid="concept-note-document-edit-error"] [role="alert"]',
    )?.textContent,
  ).toContain("edit request could not finish");
  await click("Accept remaining");
  expect(applyRequest.mock.calls[1][0].body).toEqual(
    applyRequest.mock.calls[0][0].body,
  );
});

it("shows rejection failures beside the document controls and permits retry", async () => {
  rejectRequest.mockRejectedValueOnce(new Error("Offline"));
  await click("Reject all");
  expect(
    container.querySelector(
      '[data-testid="concept-note-document-edit-error"] [role="alert"]',
    ),
  ).not.toBeNull();
  await click("Reject remaining");
  expect(rejectRequest).toHaveBeenCalledTimes(2);
});

it("retains decisions when the final inline submission fails", async () => {
  applyRequest.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => review.decide(proposal, [ids[0]], "accepted"));
  await act(async () => review.decide(proposal, [ids[1], ids[2]], "rejected"));
  expect(review.decisions[ids[0]]).toBe("accepted");
  await click("Reject remaining");
  expect(applyRequest.mock.calls[1][0].body.selected_change_ids).toEqual([
    ids[0],
  ]);
});

it("keeps draft recovery visible after apply, across failed reloads and proposal refreshes", async () => {
  onApplied
    .mockRejectedValueOnce(new Error("Draft offline"))
    .mockRejectedValueOnce(new Error("Still offline"));
  await click("Accept all");
  expect(selectReviewProposal(controller.proposals)).toBeUndefined();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Your changes were saved",
  );
  await act(async () => controller.refresh());
  expect(controller.needsDraftReload).toBe(true);
  await click("Reload draft");
  expect(controller.needsDraftReload).toBe(true);
  await click("Reload draft");
  expect(controller.needsDraftReload).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(applyRequest).toHaveBeenCalledTimes(1);
  expect(onApplied).toHaveBeenCalledTimes(3);
});

it("does not show a previous run's draft recovery in another run", async () => {
  onApplied.mockRejectedValueOnce(new Error("Draft offline"));
  await click("Accept all");
  await act(async () => root.render(<Harness runId="run-2" />));
  expect(controller.needsDraftReload).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
