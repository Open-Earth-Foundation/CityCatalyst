"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyEditProposal,
  ConceptNoteEditError,
  getEditProposal,
  listEditHistory,
  listEditProposals,
  refineEditProposal,
  rejectEditProposal,
  restoreEditHistory,
} from "@/services/concept-note-edit-api";
import {
  editApplyRequestSchema,
  type EditApplyRequest,
  type EditHistoryEntry,
  type EditHistoryRequest,
  type EditProposal,
} from "@/util/concept-note-edit-types";
import { CONCEPT_NOTE_POLL_INTERVAL_MS } from "@/util/concept-note-polling";

interface EditControllerOptions {
  runId: string | null;
  onApplied: (chapterIds: string[]) => Promise<void>;
}

function revisionKey(revisions: Record<string, number>): string {
  return JSON.stringify(
    Object.entries(revisions).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

export function useConceptNoteEdits({
  runId,
  onApplied,
}: EditControllerOptions) {
  const [proposals, setProposals] = useState<EditProposal[]>([]);
  const [history, setHistory] = useState<EditHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadedRunId, setLoadedRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{
    runId: string;
    proposalId: string;
  } | null>(null);
  const [error, setError] = useState<{ runId: string; code: string } | null>(
    null,
  );
  const activeRun = useRef(runId);
  const refreshSequence = useRef(0);
  const historySequence = useRef(0);
  const operationPending = useRef<string | null>(null);
  const applyRequests = useRef(new Map<string, EditApplyRequest>());
  const operationKeys = useRef(new Map<string, string>());

  const refreshHistory = useCallback(
    async (beforeSequence?: number) => {
      if (!runId) return;
      const sequence = ++historySequence.current;
      try {
        const result = await listEditHistory(runId, beforeSequence);
        if (activeRun.current !== runId || historySequence.current !== sequence)
          return;
        setHistory((current) =>
          beforeSequence
            ? [
                ...current,
                ...result.filter(
                  (entry) =>
                    !current.some(
                      (old) => old.application_id === entry.application_id,
                    ),
                ),
              ]
            : result,
        );
        setHistoryError(null);
      } catch {
        if (activeRun.current === runId) setHistoryError("edit_history_failed");
      }
    },
    [runId],
  );

  const refresh = useCallback(async () => {
    if (!runId) return;
    const sequence = ++refreshSequence.current;
    try {
      const result = await listEditProposals(runId);
      if (activeRun.current === runId && refreshSequence.current === sequence) {
        setProposals(result);
        setError(null);
      }
    } catch {
      if (activeRun.current === runId && refreshSequence.current === sequence)
        setError({ runId, code: "edit_refresh_failed" });
    } finally {
      if (activeRun.current === runId && refreshSequence.current === sequence)
        setLoadedRunId(runId);
    }
  }, [runId]);

  useEffect(() => {
    activeRun.current = runId;
    void Promise.resolve().then(refresh);
    void Promise.resolve().then(() => refreshHistory());
    return () => {
      activeRun.current = null;
    };
  }, [runId, refresh, refreshHistory]);

  const currentProposals = proposals.filter(
    (proposal) => proposal.run_id === runId,
  );
  const isProcessing = currentProposals.some(
    (proposal) => proposal.status === "processing",
  );
  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(
      () => void refresh(),
      CONCEPT_NOTE_POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [isProcessing, refresh]);

  async function loadProposal(proposalId: string): Promise<void> {
    if (!runId) return;
    try {
      const proposal = await getEditProposal(runId, proposalId);
      if (activeRun.current === runId && proposal.run_id === runId) {
        ++refreshSequence.current;
        setProposals((current) => [
          proposal,
          ...current.filter((item) => item.proposal_id !== proposalId),
        ]);
        setError(null);
      }
    } catch {
      if (activeRun.current === runId)
        setError({ runId, code: "edit_refresh_failed" });
    }
  }

  async function decide(
    proposal: EditProposal,
    action: "apply" | "reject",
    selectedIds?: string[],
  ): Promise<void> {
    if (
      !runId ||
      proposal.run_id !== runId ||
      operationPending.current === runId
    )
      return;
    operationPending.current = runId;
    ++refreshSequence.current;
    setBusy({ runId, proposalId: proposal.proposal_id });
    setError(null);
    try {
      let result: EditProposal;
      if (action === "apply") {
        const selection = selectedIds ? [...selectedIds].sort() : undefined;
        const cacheKey = `cnb-edit-apply:${runId}:${proposal.proposal_id}:${selection?.join(",") ?? "all"}`;
        let request = applyRequests.current.get(cacheKey);
        if (!request) {
          try {
            const stored = window.sessionStorage.getItem(cacheKey);
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
            /* Storage can be unavailable; the in-memory retry key still works. */
          }
        }
        request ??= {
          idempotency_key: crypto.randomUUID(),
          expected_revisions: proposal.base_revisions,
          ...(selection ? { selected_change_ids: selection } : {}),
        };
        applyRequests.current.set(cacheKey, request);
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(request));
        } catch {
          /* Do not block an authorized edit on storage quota/privacy settings. */
        }
        result = await applyEditProposal(runId, proposal.proposal_id, request);
      } else {
        result = await rejectEditProposal(runId, proposal.proposal_id);
      }
      if (activeRun.current !== runId) return;
      ++refreshSequence.current;
      setProposals((current) =>
        current.map((item) =>
          item.proposal_id === result.proposal_id ? result : item,
        ),
      );
      if (action === "apply" && result.result) {
        await refreshHistory();
        try {
          await onApplied(Object.keys(result.result.revisions));
        } catch {
          setError({ runId, code: "edit_refresh_failed" });
        }
      }
    } catch (requestError) {
      if (activeRun.current === runId) {
        await refresh();
        setError({
          runId,
          code:
            requestError instanceof ConceptNoteEditError
              ? requestError.code
              : "edit_request_failed",
        });
      }
    } finally {
      if (operationPending.current === runId) operationPending.current = null;
      setBusy((current) => (current?.runId === runId ? null : current));
    }
  }

  async function refine(
    proposal: EditProposal,
    instruction: string,
  ): Promise<void> {
    if (
      !runId ||
      proposal.run_id !== runId ||
      operationPending.current === runId
    )
      return;
    operationPending.current = runId;
    ++refreshSequence.current;
    setBusy({ runId, proposalId: proposal.proposal_id });
    setError(null);
    const identity = `refine:${proposal.proposal_id}:${instruction}`;
    const key = operationKeys.current.get(identity) ?? crypto.randomUUID();
    operationKeys.current.set(identity, key);
    try {
      const result = await refineEditProposal(runId, proposal.proposal_id, {
        instruction,
        scope: proposal.scope,
        idempotency_key: key,
        refines_proposal_id: proposal.proposal_id,
      });
      if (result.status === "failed" || result.status === "stale")
        operationKeys.current.delete(identity);
      if (activeRun.current === runId) {
        ++refreshSequence.current;
        setProposals((current) => [
          result,
          ...current.filter(
            (item) =>
              item.proposal_id !== result.proposal_id &&
              (result.status !== "proposed" ||
                item.proposal_id !== proposal.proposal_id),
          ),
        ]);
      }
    } catch (requestError) {
      if (activeRun.current === runId)
        setError({
          runId,
          code:
            requestError instanceof ConceptNoteEditError
              ? requestError.code
              : "edit_request_failed",
        });
    } finally {
      if (operationPending.current === runId) operationPending.current = null;
      setBusy((current) => (current?.runId === runId ? null : current));
    }
  }

  async function restore(
    entry: EditHistoryEntry,
    operation: "undo" | "restore",
    expectedRevisions: Record<string, number>,
  ): Promise<boolean> {
    if (!runId || entry.run_id !== runId || operationPending.current === runId)
      return false;
    operationPending.current = runId;
    setBusy({ runId, proposalId: entry.application_id });
    setError(null);
    const identity = `${operation}:${entry.application_id}:${revisionKey(expectedRevisions)}`;
    const key = operationKeys.current.get(identity) ?? crypto.randomUUID();
    operationKeys.current.set(identity, key);
    const body: EditHistoryRequest = {
      idempotency_key: key,
      expected_revisions: expectedRevisions,
    };
    try {
      const result = await restoreEditHistory(
        runId,
        entry.application_id,
        operation,
        body,
      );
      if (activeRun.current !== runId) return false;
      await refreshHistory();
      try {
        await onApplied(Object.keys(result.after_revisions));
      } catch {
        setError({ runId, code: "edit_refresh_failed" });
      }
      return true;
    } catch (requestError) {
      if (activeRun.current === runId)
        setError({
          runId,
          code:
            requestError instanceof ConceptNoteEditError
              ? requestError.code
              : "edit_request_failed",
        });
      return false;
    } finally {
      if (operationPending.current === runId) operationPending.current = null;
      setBusy((current) => (current?.runId === runId ? null : current));
    }
  }

  return {
    proposals: currentProposals,
    isLoading: Boolean(runId && loadedRunId !== runId),
    busy: busy?.runId === runId ? busy.proposalId : null,
    error: error?.runId === runId ? error.code : null,
    history: history.filter((entry) => entry.run_id === runId),
    historyError,
    refresh,
    loadProposal,
    refreshHistory,
    refine,
    restore,
    apply: (proposal: EditProposal, selectedIds?: string[]) =>
      decide(proposal, "apply", selectedIds),
    reject: (proposal: EditProposal) => decide(proposal, "reject"),
  };
}
