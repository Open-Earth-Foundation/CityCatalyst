"use client";

import {
  buildInitialDecisionState,
  canSaveToInventory,
  resolvedProposalIdsFromReview,
} from "@/components/StationaryEnergyDraft/flow";
import { resolveStationaryEnergyDraftResume } from "@/components/StationaryEnergyDraft/resume";
import {
  addResolvedProposalId,
  nextDecisionState,
  removeResolvedProposalId,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import type {
  ErrorRecoveryAction,
  LoadingAction,
  UseStationaryEnergyChatArtifactControllerParams,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import { resolveErrorMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-tool-helpers";
import {
  createChatThread,
  fetchDraftRuns,
  fetchDraftStatus,
  fetchResumedDraft,
  startDraftRun,
} from "@/components/StationaryEnergyDraft/stationary-energy-draft-api";
import { clearStoredDraftContext } from "@/components/StationaryEnergyDraft/storage";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftListItem,
  DraftProposal,
  DraftStatusResponse,
} from "@/components/StationaryEnergyDraft/types";
import type { useStationaryEnergyPendingRequest } from "@/components/StationaryEnergyDraft/use-stationary-energy-pending-request";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type DraftSessionParams = Pick<
  UseStationaryEnergyChatArtifactControllerParams,
  "cityId" | "featureEnabled" | "inventoryId" | "lng" | "queryDraftRunId" | "t"
> & {
  setLoadingAction: Dispatch<SetStateAction<LoadingAction>>;
  clearError: () => void;
  showError: (
    message: string,
    recoveryAction?: ErrorRecoveryAction | null,
  ) => void;
  applyDraftResumeContext: ReturnType<
    typeof useStationaryEnergyPendingRequest
  >["applyDraftResumeContext"];
  resetDraftStartResume: () => void;
};
export function useStationaryEnergyDraftSession(params: DraftSessionParams) {
  const {
    cityId,
    featureEnabled,
    inventoryId,
    lng,
    queryDraftRunId,
    t,
    setLoadingAction,
    clearError,
    showError,
    applyDraftResumeContext,
    resetDraftStartResume,
  } = params;
  const [draftState, setDraftState] = useState<DraftStatusResponse | null>(
    null,
  );
  const [decisionState, setDecisionState] = useState<
    Record<string, DraftDecisionState>
  >({});
  const [resolvedProposalIds, setResolvedProposalIds] = useState<Set<string>>(
    new Set(),
  );
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draftRuns, setDraftRuns] = useState<DraftListItem[]>([]);
  const [draftListLoading, setDraftListLoading] = useState(false);
  const resumeAttemptedRef = useRef(false);
  const canSaveAcceptedRowsToInventoryRef = useRef(false);
  const [acknowledgedStaleDraftRunId, setAcknowledgedStaleDraftRunId] =
    useState<string | null>(null);
  const applyDraftState = useCallback(
    (payload: DraftStatusResponse) => {
      applyDraftResumeContext(payload);
      const nextDecisionState = buildInitialDecisionState(payload);
      const nextResolvedProposalIds = resolvedProposalIdsFromReview(payload);
      canSaveAcceptedRowsToInventoryRef.current = canSaveToInventory({
        draftState: payload,
        resolvedProposalIds: nextResolvedProposalIds,
        decisionState: nextDecisionState,
      });
      setDraftState(payload);
      setDecisionState(nextDecisionState);
      setResolvedProposalIds(nextResolvedProposalIds);
      setThreadId(payload.thread_id ?? null);
      if (!payload.staleness?.is_stale) {
        setAcknowledgedStaleDraftRunId(null);
      }
    },
    [applyDraftResumeContext],
  );

  const loadDraftRuns = useCallback(async (): Promise<DraftListItem[]> => {
    setDraftListLoading(true);
    try {
      const payload = await fetchDraftRuns({ cityId, inventoryId });
      const nextDrafts = payload.drafts ?? [];
      setDraftRuns(nextDrafts);
      return nextDrafts;
    } finally {
      setDraftListLoading(false);
    }
  }, [cityId, inventoryId]);

  const refreshDraftStatusSilently = useCallback(
    async (draftRunId: string): Promise<DraftStatusResponse> => {
      const payload = await fetchDraftStatus({ draftRunId, inventoryId });
      applyDraftState(payload);
      await loadDraftRuns();
      return payload;
    },
    [applyDraftState, inventoryId, loadDraftRuns],
  );

  const refreshDraftStatus = useCallback(
    async (draftRunId: string): Promise<DraftStatusResponse> => {
      setLoadingAction("refresh");
      try {
        return await refreshDraftStatusSilently(draftRunId);
      } finally {
        setLoadingAction(null);
      }
    },
    [refreshDraftStatusSilently, setLoadingAction],
  );

  const resumeDraftFromServer =
    useCallback(async (): Promise<DraftStatusResponse | null> => {
      const payload = await fetchResumedDraft({ cityId, inventoryId });
      if (!payload) {
        return null;
      }
      applyDraftState(payload);
      await loadDraftRuns();
      return payload;
    }, [applyDraftState, cityId, inventoryId, loadDraftRuns]);

  useEffect(() => {
    if (!featureEnabled || resumeAttemptedRef.current) {
      return;
    }

    resumeAttemptedRef.current = true;
    void resolveStationaryEnergyDraftResume({
      inventoryId,
      queryDraftRunId,
      refreshDraftStatus,
      resumeDraftFromServer,
    }).catch((error) => {
      showError(
        resolveErrorMessage(
          t,
          error,
          "error-failed-to-resume-stationary-energy-draft",
        ),
      );
    });
  }, [
    featureEnabled,
    inventoryId,
    queryDraftRunId,
    refreshDraftStatus,
    resumeDraftFromServer,
    showError,
    t,
  ]);

  useEffect(() => {
    if (!featureEnabled) {
      return;
    }
    void loadDraftRuns().catch((error) => {
      showError(
        resolveErrorMessage(
          t,
          error,
          "error-failed-to-load-stationary-energy-drafts",
        ),
      );
    });
  }, [featureEnabled, loadDraftRuns, showError, t]);
  // Poll only during generation; refreshing ready drafts would reset review choices.
  const draftRunId = draftState?.draft_run_id;
  const isGenerating = Boolean(
    draftState &&
    ["resolving_scope", "loading_context", "generating"].includes(
      draftState.status,
    ),
  );
  useEffect(() => {
    if (!featureEnabled || !draftRunId || !isGenerating) {
      return;
    }
    let cancelled = false;
    const interval = setInterval(() => {
      void fetchDraftStatus({ draftRunId, inventoryId })
        .then((payload) => {
          if (!cancelled) {
            applyDraftState(payload);
          }
        })
        .catch(() => {
          // Transient poll failure: keep the last state and retry next tick.
        });
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [featureEnabled, draftRunId, isGenerating, inventoryId, applyDraftState]);
  const ensureThreadId = useCallback(
    async (required = true): Promise<string | null> => {
      if (threadId) {
        return threadId;
      }
      if (draftState?.thread_id) {
        setThreadId(draftState.thread_id);
        return draftState.thread_id;
      }

      const controller = new AbortController();
      const timeoutId = required
        ? null
        : window.setTimeout(() => controller.abort(), 4500);

      try {
        const payload = await createChatThread({
          inventoryId,
          signal: controller.signal,
        });
        setThreadId(payload.threadId);
        return payload.threadId;
      } catch (error) {
        if (required) {
          throw error;
        }
        showError(t("error-chat-history-unavailable"));
        return null;
      } finally {
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
        }
      }
    },
    [draftState, inventoryId, showError, t, threadId],
  );

  const startDraft = useCallback(async (): Promise<void> => {
    resetDraftStartResume();
    clearError();
    setLoadingAction("start");
    try {
      const nextThreadId = await ensureThreadId(false);
      const payload = await startDraftRun({
        cityId,
        inventoryId,
        threadId: nextThreadId,
        locale: lng,
      });
      const draftRunId = String(payload.draft_run_id ?? "");
      if (!draftRunId) {
        throw new Error(t("error-draft-start-response-missing-run-id"));
      }
      await refreshDraftStatus(draftRunId);
    } catch (error) {
      showError(
        resolveErrorMessage(
          t,
          error,
          "error-failed-to-start-stationary-energy-draft",
        ),
      );
    } finally {
      setLoadingAction(null);
    }
  }, [
    cityId,
    clearError,
    ensureThreadId,
    inventoryId,
    lng,
    refreshDraftStatus,
    showError,
    t,
    resetDraftStartResume,
    setLoadingAction,
  ]);
  const continueStaleDraft = useCallback((): void => {
    if (!draftState?.draft_run_id) {
      return;
    }
    setAcknowledgedStaleDraftRunId(draftState.draft_run_id);
  }, [draftState]);
  const chooseDecision = useCallback(
    (
      proposal: DraftProposal,
      action: DraftDecisionAction,
      selectedSourceId = "",
    ): void => {
      setDecisionState((current) =>
        nextDecisionState(
          current,
          proposal.proposal_id,
          action,
          selectedSourceId,
        ),
      );
      setResolvedProposalIds((current) =>
        addResolvedProposalId(current, proposal.proposal_id),
      );
    },
    [],
  );

  const editDecision = useCallback((proposalId: string): void => {
    setResolvedProposalIds((current) =>
      removeResolvedProposalId(current, proposalId),
    );
  }, []);

  const resetDraft = useCallback((): void => {
    clearStoredDraftContext(inventoryId);
    setDraftState(null);
    setDecisionState({});
    setResolvedProposalIds(new Set());
    setThreadId(null);
    setAcknowledgedStaleDraftRunId(null);
  }, [inventoryId]);
  return {
    draftState,
    decisionState,
    resolvedProposalIds,
    draftRuns,
    draftListLoading,
    draftRunId,
    acknowledgedStaleDraftRunId,
    setAcknowledgedStaleDraftRunId,
    canSaveAcceptedRowsToInventoryRef,
    ensureThreadId,
    startDraft,
    refreshDraftStatus,
    refreshDraftStatusSilently,
    continueStaleDraft,
    chooseDecision,
    editDecision,
    resetDraft,
  };
}
