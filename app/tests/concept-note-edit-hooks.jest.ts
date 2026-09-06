/** @jest-environment jsdom */
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, createElement, useLayoutEffect } from "react";
import type { Root } from "react-dom/client";
import type {
  SSEStreamController,
  SSEStreamOptions,
} from "@/hooks/useSSEStream";
import type { EditProposal } from "@/util/concept-note-edit-types";
import {
  cleanup,
  historyEntry,
  mount,
  prepareDom,
  proposal,
  runId,
  t,
} from "./cnb-edit-ui-helpers";

prepareDom();
type EditApi = typeof import("@/services/concept-note-edit-api");
const list = jest.fn<EditApi["listEditProposals"]>();
const get = jest.fn<EditApi["getEditProposal"]>();
const apply = jest.fn<EditApi["applyEditProposal"]>();
const reject = jest.fn<EditApi["rejectEditProposal"]>();
const refine = jest.fn<EditApi["refineEditProposal"]>();
const listHistory = jest.fn<EditApi["listEditHistory"]>();
const restoreHistory = jest.fn<EditApi["restoreEditHistory"]>();
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super("Edit failed");
  }
}
jest.unstable_mockModule("@/services/concept-note-edit-api", () => ({
  listEditProposals: list,
  getEditProposal: get,
  applyEditProposal: apply,
  rejectEditProposal: reject,
  refineEditProposal: refine,
  listEditHistory: listHistory,
  restoreEditHistory: restoreHistory,
  ConceptNoteEditError: ApiError,
}));
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
let streamOptions: SSEStreamOptions;
const startStream = jest
  .fn<SSEStreamController["startStream"]>()
  .mockResolvedValue(undefined);
const stopStream = jest.fn();
jest.unstable_mockModule("@/hooks/useSSEStream", () => ({
  useSSEStream: (options: SSEStreamOptions) => {
    streamOptions = options;
    return { startStream, stopStream };
  },
}));
let useEdits: typeof import("@/components/ConceptNoteWorkspace/use-concept-note-edits").useConceptNoteEdits;
let useChat: typeof import("@/components/ConceptNoteWorkspace/use-concept-note-chat").useConceptNoteChat;
let controller: ReturnType<typeof useEdits>;
let chat: ReturnType<typeof useChat>;
let root: Root;
const onApplied = jest.fn<(chapterIds: string[]) => Promise<void>>();
const onProposal = jest.fn<(proposalId: string) => Promise<void>>();

beforeAll(async () => {
  ({ useConceptNoteEdits: useEdits } =
    await import("@/components/ConceptNoteWorkspace/use-concept-note-edits"));
  ({ useConceptNoteChat: useChat } =
    await import("@/components/ConceptNoteWorkspace/use-concept-note-chat"));
});
beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  list.mockResolvedValue([proposal]);
  get.mockResolvedValue(proposal);
  apply.mockResolvedValue({
    ...proposal,
    status: "applied",
    result: {
      application_id: "id",
      accepted_change_ids: [proposal.changes[0].change_id],
      revisions: { [proposal.changes[0].chapter_id]: 2 },
    },
  });
  reject.mockResolvedValue({ ...proposal, status: "rejected" });
  refine.mockResolvedValue({
    ...proposal,
    proposal_id: "88888888-8888-4888-8888-888888888888",
  });
  listHistory.mockResolvedValue([]);
  restoreHistory.mockResolvedValue({
    ...historyEntry,
    operation: "undo",
    after_revisions: { [proposal.changes[0].chapter_id]: 3 },
  });
  onApplied.mockResolvedValue(undefined);
  onProposal.mockResolvedValue(undefined);
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: jest
      .fn<
        () => Promise<{ ok: boolean; json: () => Promise<{ messages: [] }> }>
      >()
      .mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) }),
  });
});
afterEach(async () => {
  await cleanup(root);
  jest.useRealTimers();
});

function Harness({ id = runId }: { id?: string }) {
  const current = useEdits({ runId: id, onApplied });
  useLayoutEffect(() => {
    controller = current;
  }, [current]);
  return createElement("output", null, current.error);
}
async function render() {
  ({ root } = await mount(createElement(Harness)));
}

it("restores pending proposals on reload without modifying the draft", async () => {
  await render();
  expect(controller.proposals).toEqual([proposal]);
  expect(apply).not.toHaveBeenCalled();
  expect(controller.isLoading).toBe(false);
});
it("applies using exact expected revisions and reports affected chapter focus", async () => {
  await render();
  await act(async () => controller.apply(proposal));
  expect(apply.mock.calls[0][2].expected_revisions).toEqual(
    proposal.base_revisions,
  );
  expect(controller.proposals[0].status).toBe("applied");
  expect(onApplied).toHaveBeenCalledWith([proposal.changes[0].chapter_id]);
});
it("keeps the same idempotency key when a request outcome is uncertain", async () => {
  await render();
  apply.mockRejectedValueOnce(new Error("Connection lost"));
  await act(async () => controller.apply(proposal));
  await act(async () => controller.apply(proposal));
  expect(apply.mock.calls[0][2]).toEqual(apply.mock.calls[1][2]);
});
it("rejects a proposal without refreshing or changing draft content", async () => {
  await render();
  await act(async () => controller.reject(proposal));
  expect(controller.proposals[0].status).toBe("rejected");
  expect(onApplied).not.toHaveBeenCalled();
});
it("refreshes persisted stale status after a conflict", async () => {
  await render();
  apply.mockRejectedValueOnce(new ApiError(409, "stale_base"));
  list.mockResolvedValueOnce([{ ...proposal, status: "stale" }]);
  await act(async () => controller.apply(proposal));
  expect(controller.error).toBe("stale_base");
  expect(controller.proposals[0].status).toBe("stale");
});
it("ignores a foreign run proposal response", async () => {
  await render();
  get.mockResolvedValueOnce({
    ...proposal,
    run_id: "other-run",
    instruction: "foreign",
  });
  await act(async () => controller.loadProposal("foreign"));
  expect(controller.proposals[0].instruction).not.toBe("foreign");
});
it("serializes duplicate user clicks while an apply request is in flight", async () => {
  await render();
  let resolve!: (value: EditProposal) => void;
  apply.mockReturnValueOnce(
    new Promise<EditProposal>((done) => {
      resolve = done;
    }),
  );
  let pending: Promise<void>;
  await act(async () => {
    pending = controller.apply(proposal);
    await controller.apply(proposal);
  });
  expect(apply).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({ ...proposal, status: "applied", result: null });
    await pending;
  });
});
it("sends real UI focus through chat and consumes only typed proposal events", async () => {
  function ChatHarness() {
    const current = useChat({
      lng: "en",
      threadId: "thread",
      editScope: proposal.scope,
      onProposal,
    });
    useLayoutEffect(() => {
      chat = current;
    }, [current]);
    return null;
  }
  ({ root } = await mount(createElement(ChatHarness)));
  await act(async () => chat.sendMessage("Make the opening concise"));
  const body = JSON.parse(startStream.mock.calls[0][1]!.body as string);
  expect(body.context.concept_note_edit.scope).toEqual(proposal.scope);
  expect(body.context.concept_note_edit.idempotency_key).toMatch(
    /^[a-f0-9-]+$/,
  );
  await act(async () =>
    streamOptions.onToolResult!({
      action: "concept_note.edit.propose",
      success: true,
      data: { proposal_id: proposal.proposal_id },
    }),
  );
  expect(onProposal).toHaveBeenCalledWith(proposal.proposal_id);
  streamOptions.onToolResult!({
    action: "other",
    data: { proposal_id: "bad" },
  });
  expect(onProposal).toHaveBeenCalledTimes(1);
});

it("submits only whole selected groups while keeping Apply all independent", async () => {
  await render();
  await act(async () =>
    controller.apply(proposal, [proposal.changes[0].change_id]),
  );
  expect(apply.mock.calls[0][2].selected_change_ids).toEqual([
    proposal.changes[0].change_id,
  ]);
});
it("restores an uncertain apply key after reload despite JSON key reordering", async () => {
  const otherId = "99999999-9999-4999-8999-999999999999";
  const first = {
    ...proposal,
    base_revisions: { [otherId]: 1, ...proposal.base_revisions },
  };
  list.mockResolvedValue([first]);
  await render();
  apply.mockRejectedValueOnce(new Error("Lost response"));
  await act(async () => controller.apply(first));
  const originalKey = apply.mock.calls[0][2].idempotency_key;
  await cleanup(root);
  const reloaded = {
    ...proposal,
    base_revisions: { ...proposal.base_revisions, [otherId]: 1 },
  };
  list.mockResolvedValue([reloaded]);
  await render();
  await act(async () => controller.apply(reloaded));
  expect(apply.mock.calls[1][2].idempotency_key).toBe(originalKey);
});
it("keeps an applied outcome truthful when refreshing the draft fails", async () => {
  await render();
  onApplied.mockRejectedValueOnce(new Error("Draft refresh unavailable"));
  await act(async () => controller.apply(proposal));
  expect(controller.proposals[0].status).toBe("applied");
  expect(controller.error).toBe("edit_refresh_failed");
});
it("refinement retains a good prior proposal when replacement planning fails", async () => {
  await render();
  refine.mockResolvedValueOnce({
    ...proposal,
    proposal_id: "88888888-8888-4888-8888-888888888888",
    status: "failed",
    changes: [],
  });
  await act(async () =>
    controller.refine(proposal, "Make that proposal shorter"),
  );
  expect(controller.proposals.map((item) => item.status)).toEqual([
    "failed",
    "proposed",
  ]);
  expect(refine.mock.calls[0][2].refines_proposal_id).toBe(
    proposal.proposal_id,
  );
  await act(async () =>
    controller.refine(proposal, "Make that proposal shorter"),
  );
  expect(refine.mock.calls[0][2].idempotency_key).not.toBe(
    refine.mock.calls[1][2].idempotency_key,
  );
});
it("successful refinement replaces the pending card and keeps a stable retry key", async () => {
  await render();
  refine.mockRejectedValueOnce(new Error("Lost response"));
  await act(async () => controller.refine(proposal, "More concise"));
  await act(async () => controller.refine(proposal, "More concise"));
  expect(refine.mock.calls[0][2].idempotency_key).toBe(
    refine.mock.calls[1][2].idempotency_key,
  );
  expect(controller.proposals).toHaveLength(1);
  expect(controller.proposals[0].proposal_id).not.toBe(proposal.proposal_id);
});
it("restores history with frozen reviewed bases and idempotent conflict retries", async () => {
  listHistory.mockResolvedValue([historyEntry]);
  await render();
  restoreHistory.mockRejectedValueOnce(new ApiError(409, "stale_base"));
  const expected = historyEntry.after_revisions;
  await act(async () => {
    expect(await controller.restore(historyEntry, "undo", expected)).toBe(
      false,
    );
  });
  await act(async () => {
    expect(await controller.restore(historyEntry, "undo", expected)).toBe(true);
  });
  expect(restoreHistory.mock.calls[0][3]).toEqual(
    restoreHistory.mock.calls[1][3],
  );
  expect(restoreHistory.mock.calls[1][3].expected_revisions).toEqual(expected);
  expect(onApplied).toHaveBeenCalledWith([proposal.changes[0].chapter_id]);
});
it("loads older history without duplicating a repeated page", async () => {
  listHistory.mockResolvedValue([historyEntry]);
  await render();
  await act(async () => controller.refreshHistory(2));
  expect(controller.history).toEqual([historyEntry]);
});
it("surfaces a durable failed proposal event instead of silently losing its review card", async () => {
  function ChatHarness() {
    const current = useChat({
      lng: "en",
      threadId: "thread",
      editScope: proposal.scope,
      onProposal,
    });
    useLayoutEffect(() => {
      chat = current;
    }, [current]);
    return null;
  }
  ({ root } = await mount(createElement(ChatHarness)));
  await act(async () =>
    streamOptions.onToolResult!({
      action: "concept_note.edit.propose",
      success: false,
      data: { proposal_id: proposal.proposal_id, status: "failed" },
    }),
  );
  expect(onProposal).toHaveBeenCalledWith(proposal.proposal_id);
});
