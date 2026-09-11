"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/hooks";
import { editApi, editErrorCode } from "@/services/concept-note-edit-api";
import {
  editApplyRequestSchema,
  type EditApplyRequest,
  type EditProposal,
} from "@/util/concept-note-edit-types";
import { CONCEPT_NOTE_POLL_INTERVAL_MS } from "@/util/concept-note-polling";

function revisionKey(revisions: Record<string, number>): string {
  return JSON.stringify(
    Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Query state belongs to RTK; this hook owns only explicit review operations. */
export function useConceptNoteEdits({
  runId,
  onApplied,
}: {
  runId: string | null;
  onApplied: (chapterIds: string[]) => Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const cached = editApi.endpoints.listEditProposals.useQueryState(runId ?? "");
  const processing = cached.currentData?.some(
    (item) => item.status === "processing",
  );
  const query = editApi.useListEditProposalsQuery(runId ?? "", {
    skip: !runId,
    pollingInterval: processing ? CONCEPT_NOTE_POLL_INTERVAL_MS : 0,
    skipPollingIfUnfocused: true,
    refetchOnMountOrArgChange: true,
  });
  const [get] = editApi.useLazyGetEditProposalQuery();
  const [apply] = editApi.useApplyEditProposalMutation();
  const [reject] = editApi.useRejectEditProposalMutation();
  const [refineRequest] = editApi.useRefineEditProposalMutation();
  const [busy, setBusy] = useState<{
    runId: string;
    proposalId: string;
  } | null>(null);
  const [error, setError] = useState<{ runId: string; code: string } | null>(
    null,
  );
  const activeRun = useRef(runId);
  const [draftReload, setDraftReload] = useState<{
    runId: string;
    chapterIds: string[];
  } | null>(null);
  const [reloadingRun, setReloadingRun] = useState<string | null>(null);
  const pending = useRef<typeof busy>(null);
  const applyRequests = useRef(new Map<string, EditApplyRequest>());
  const refineKeys = useRef(new Map<string, string>());
  useEffect(() => {
    activeRun.current = runId;
    return () => {
      activeRun.current = null;
    };
  }, [runId]);

  function remember(result: EditProposal, replacedId?: string): void {
    if (!runId || activeRun.current !== runId || result.run_id !== runId)
      return;
    dispatch(
      editApi.util.updateQueryData("listEditProposals", runId, (items) => {
        const retained = items.filter(
          (item) =>
            item.proposal_id !== result.proposal_id &&
            item.proposal_id !== replacedId,
        );
        return [result, ...retained];
      }),
    );
  }
  async function loadProposal(proposalId: string): Promise<void> {
    if (!runId) return;
    try {
      const result = await get({ runId, proposalId }).unwrap();
      await dispatch(
        editApi.endpoints.listEditProposals.initiate(runId, {
          subscribe: false,
        }),
      ).unwrap();
      remember(result);
      if (activeRun.current === runId) setError(null);
    } catch {
      if (activeRun.current === runId)
        setError({ runId, code: "edit_refresh_failed" });
    }
  }
  function acceptance(
    proposal: EditProposal,
    selectedIds?: string[],
  ): EditApplyRequest {
    const selection = selectedIds ? [...selectedIds].sort() : undefined;
    const cacheKey = `cnb-edit-apply:${runId}:${proposal.proposal_id}:${selection?.join(",") ?? "all"}`;
    let request = applyRequests.current.get(cacheKey);
    if (!request) {
      try {
        const stored = sessionStorage.getItem(cacheKey);
        const parsed = stored
          ? editApplyRequestSchema.safeParse(JSON.parse(stored))
          : null;
        if (
          parsed?.success &&
          revisionKey(parsed.data.expected_revisions) ===
            revisionKey(proposal.base_revisions) &&
          JSON.stringify(parsed.data.selected_change_ids ?? undefined) ===
            JSON.stringify(selection)
        )
          request = parsed.data;
      } catch {
        /* Privacy settings may disable storage; retain the in-memory retry. */
      }
    }
    request ??= {
      idempotency_key: crypto.randomUUID(),
      expected_revisions: proposal.base_revisions,
      ...(selection ? { selected_change_ids: selection } : {}),
    };
    applyRequests.current.set(cacheKey, request);
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(request));
    } catch {
      /* An authorized edit does not depend on storage availability. */
    }
    return request;
  }
  async function operate(
    proposal: EditProposal,
    action: "apply" | "reject" | "refine",
    options: { selectedIds?: string[]; instruction?: string } = {},
  ): Promise<boolean> {
    if (!runId || proposal.run_id !== runId || pending.current?.runId === runId)
      return false;
    const operation = { runId, proposalId: proposal.proposal_id };
    pending.current = operation;
    setBusy(operation);
    setError(null);
    try {
      let result: EditProposal;
      if (action === "refine") {
        const instruction = options.instruction!;
        const identity = `${proposal.proposal_id}:${instruction}`;
        const key = refineKeys.current.get(identity) ?? crypto.randomUUID();
        refineKeys.current.set(identity, key);
        result = await refineRequest({
          ...operation,
          body: {
            instruction,
            scope: proposal.scope,
            idempotency_key: key,
            refines_proposal_id: proposal.proposal_id,
          },
        }).unwrap();
        if (result.status === "failed" || result.status === "stale")
          refineKeys.current.delete(identity);
      } else {
        result = await (
          action === "apply"
            ? apply({
                ...operation,
                body: acceptance(proposal, options.selectedIds),
              })
            : reject(operation)
        ).unwrap();
      }
      if (activeRun.current !== runId) return false;
      remember(
        result,
        action === "refine" && result.status === "proposed"
          ? proposal.proposal_id
          : undefined,
      );
      if (action === "apply" && result.result) {
        const chapterIds = Object.keys(result.result.revisions);
        try {
          await onApplied(chapterIds);
          if (activeRun.current === runId) setDraftReload(null);
        } catch {
          if (activeRun.current === runId)
            setDraftReload({ runId, chapterIds });
        }
      }
      return true;
    } catch (failure) {
      if (activeRun.current === runId)
        setError({ runId, code: editErrorCode(failure) });
      return false;
    } finally {
      if (pending.current === operation) {
        pending.current = null;
        setBusy(null);
      }
    }
  }
  return {
    proposals: (query.currentData ?? []).filter(
      (item) => item.run_id === runId,
    ),
    isLoading: Boolean(runId && query.isLoading),
    busy: busy?.runId === runId ? busy.proposalId : null,
    error:
      error?.runId === runId
        ? error.code
        : query.isError
          ? "edit_refresh_failed"
          : null,
    needsDraftReload: draftReload?.runId === runId && Boolean(draftReload),
    reloadingDraft: reloadingRun === runId && Boolean(runId),
    reloadDraft: async () => {
      if (!draftReload || draftReload.runId !== runId || reloadingRun === runId)
        return;
      setReloadingRun(runId);
      try {
        await onApplied(draftReload.chapterIds);
        if (activeRun.current === runId) setDraftReload(null);
      } catch {
        // Keep the recovery action until the saved draft is loaded successfully.
      } finally {
        setReloadingRun((current) => (current === runId ? null : current));
      }
    },
    refresh: async () => {
      if (runId) {
        try {
          await query.refetch().unwrap();
          if (activeRun.current === runId) setError(null);
        } catch {
          if (activeRun.current === runId)
            setError({ runId, code: "edit_refresh_failed" });
        }
      }
    },
    loadProposal,
    apply: (proposal: EditProposal, selectedIds?: string[]) =>
      operate(proposal, "apply", { selectedIds }),
    reject: (proposal: EditProposal) => operate(proposal, "reject"),
    refine: (proposal: EditProposal, instruction: string) =>
      operate(proposal, "refine", { instruction }),
  };
}
