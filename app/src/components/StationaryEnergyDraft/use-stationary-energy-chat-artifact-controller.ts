"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChatThread,
  fetchDraftRuns,
  fetchDraftStatus,
  fetchResumedDraft,
  startDraftRun,
} from "@/components/StationaryEnergyDraft/stationary-energy-draft-api";
import {
  addResolvedProposalId,
  buildFocusedDecisionStatePayload,
  buildStationaryEnergyChatRequest,
  hasTerminalDraftStatus,
  nextDecisionState,
  resolveChatActivityLabel,
  removeResolvedProposalId,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import {
  buildSourcePreferenceLabel,
  buildSourcePreferenceReply,
  type SourcePreferenceCommand,
} from "@/components/StationaryEnergyDraft/source-preference";
import { type StationaryEnergyToolChoiceSummary } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import {
  buildArtifactRows,
  buildDecisionReviewContext,
  buildInitialDecisionState,
  buildSourcePreferenceOptions,
  canPersistDraftReview,
  canReviewDraftStatus,
  canSaveToInventory,
  countDraftProposals,
  deriveDraftStage,
  pendingDecisionReviewProposals,
  resolvedProposalIdsFromReview,
  unresolvedBlockingProposalIds,
} from "@/components/StationaryEnergyDraft/flow";
import { resolveStationaryEnergyDraftResume } from "@/components/StationaryEnergyDraft/resume";
import { clearStoredDraftContext } from "@/components/StationaryEnergyDraft/storage";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftListItem,
  DraftProposal,
  DraftStatusResponse,
} from "@/components/StationaryEnergyDraft/types";
import { useStationaryEnergyChatMessages } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-messages";
import { useStationaryEnergyPendingRequest } from "@/components/StationaryEnergyDraft/use-stationary-energy-pending-request";
import { useStationaryEnergyToolResults } from "@/components/StationaryEnergyDraft/use-stationary-energy-tool-results";
import { useStationaryEnergyReviewSave } from "@/components/StationaryEnergyDraft/use-stationary-energy-review-save";
import { useSSEStream } from "@/hooks/useSSEStream";
import type {
  LoadingAction,
  ErrorRecoveryAction,
  UseStationaryEnergyChatArtifactControllerParams,
  StationaryEnergyChatArtifactController,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import {
  confirmedBulkReviewChoicePayload,
  confirmedRollbackReviewChoicePayload,
  translateMessage,
  resolveErrorMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-tool-helpers";

const EMPTY_RESOLVED_PROPOSALS = new Set<string>();

export function useStationaryEnergyChatArtifactController(
  params: UseStationaryEnergyChatArtifactControllerParams,
): StationaryEnergyChatArtifactController {
  const {
    cityId,
    cityName,
    featureEnabled,
    initialStage,
    inventoryId,
    inventoryYear,
    lng,
    queryDraftRunId,
    t,
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
  const [chatInput, setChatInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRecoveryAction, setErrorRecoveryAction] =
    useState<ErrorRecoveryAction | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [draftRuns, setDraftRuns] = useState<DraftListItem[]>([]);
  const [draftListLoading, setDraftListLoading] = useState(false);
  const resumeAttemptedRef = useRef(false);
  const [sourcePreference, setSourcePreference] =
    useState<SourcePreferenceCommand | null>(null);
  const pendingInventorySaveConfirmationMessageRef = useRef<
    string | null | undefined
  >(undefined);
  const lastUserChatContentRef = useRef<string | null>(null);
  const {
    pendingDraftStartResume,
    draftStartResumeNotice,
    resetDraftStartResume,
    updatePendingDraftStartResume,
    applyDraftResumeContext,
    cancelDraftStartResume,
    isPendingDraftStartResume,
  } = useStationaryEnergyPendingRequest(inventoryId, t);
  // The tool the agent is running in the current chat turn, if any.
  const canSaveAcceptedRowsToInventoryRef = useRef(false);
  const [focusedProposalId, setFocusedProposalId] = useState<string | null>(
    null,
  );
  const [acknowledgedStaleDraftRunId, setAcknowledgedStaleDraftRunId] =
    useState<string | null>(null);

  const clearError = useCallback((): void => {
    setErrorMessage(null);
    setErrorRecoveryAction(null);
  }, []);

  const showError = useCallback(
    (
      message: string,
      recoveryAction: ErrorRecoveryAction | null = null,
    ): void => {
      setErrorMessage(message);
      setErrorRecoveryAction(recoveryAction);
    },
    [],
  );

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

  const refreshDraftStatus = useCallback(
    async (draftRunId: string): Promise<DraftStatusResponse> => {
      setLoadingAction("refresh");
      try {
        const payload = await fetchDraftStatus({ draftRunId, inventoryId });
        applyDraftState(payload);
        await loadDraftRuns();
        return payload;
      } finally {
        setLoadingAction(null);
      }
    },
    [applyDraftState, inventoryId, loadDraftRuns],
  );

  const refreshDraftStatusSilently = useCallback(
    async (draftRunId: string): Promise<void> => {
      const payload = await fetchDraftStatus({ draftRunId, inventoryId });
      applyDraftState(payload);
      await loadDraftRuns();
    },
    [applyDraftState, inventoryId, loadDraftRuns],
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

  // Staggered generation: while a draft is still being generated, poll its
  // status so proposals appear incrementally (the backend commits each batch
  // as it completes). IMPORTANT: only poll during the active generation
  // statuses. Once the run reaches "ready" the user is in the decision/review
  // stage (which stays "ready" until saved), and re-applying state on a timer
  // would reset their in-progress selections and bounce them back to row 1.
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

  const counts = useMemo(() => countDraftProposals(draftState), [draftState]);
  const unresolvedBlockingIds = useMemo(
    () =>
      unresolvedBlockingProposalIds({
        draftState,
        resolvedProposalIds,
      }),
    [draftState, resolvedProposalIds],
  );
  const baseStage = deriveDraftStage({
    draftState,
    resolvedProposalIds,
    loadingAction,
    preferredStage: initialStage,
  });
  const stage =
    baseStage === "decision" && unresolvedBlockingIds.length === 0
      ? "review"
      : baseStage;
  const rows = useMemo(() => buildArtifactRows(draftState, t), [draftState, t]);
  const pendingDecisionProposals = useMemo(
    () =>
      pendingDecisionReviewProposals({
        draftState,
        resolvedProposalIds,
      }),
    [draftState, resolvedProposalIds],
  );
  const decisionReviewContext = useMemo(
    () =>
      buildDecisionReviewContext({
        draftState,
        resolvedProposalIds: EMPTY_RESOLVED_PROPOSALS,
        t,
      }),
    [draftState, t],
  );
  const hasSourceBackedProposals = useMemo(
    () => decisionReviewContext.length > 0,
    [decisionReviewContext],
  );
  const activeDecision = pendingDecisionProposals[0] ?? null;
  const setFocusedProposal = useCallback((proposalId: string | null) => {
    setFocusedProposalId(proposalId);
  }, []);
  // The row whose decision detail is shown in the right-side focus pane.
  // Uses the user's explicit selection when valid, else the first pending
  // decision, else the first reviewable row.
  const effectiveFocusedProposalId = useMemo(() => {
    if (
      focusedProposalId &&
      decisionReviewContext.some(
        (context) => context.proposal_id === focusedProposalId,
      )
    ) {
      return focusedProposalId;
    }
    return (
      activeDecision?.proposal_id ??
      decisionReviewContext[0]?.proposal_id ??
      null
    );
  }, [focusedProposalId, decisionReviewContext, activeDecision]);
  const focusedDecisionState = useMemo(
    () =>
      buildFocusedDecisionStatePayload({
        decisionReviewContext,
        decisionState,
        focusedProposalId: effectiveFocusedProposalId,
        resolvedProposalIds,
      }),
    [
      decisionReviewContext,
      decisionState,
      effectiveFocusedProposalId,
      resolvedProposalIds,
    ],
  );
  const canSaveAcceptedRowsToInventory = canSaveToInventory({
    draftState,
    resolvedProposalIds,
    decisionState,
    isSaving: loadingAction === "save_inventory",
  });
  useEffect(() => {
    canSaveAcceptedRowsToInventoryRef.current = canSaveAcceptedRowsToInventory;
  }, [canSaveAcceptedRowsToInventory]);
  const canPersistDraft = canPersistDraftReview({
    draftState,
    resolvedProposalIds,
    decisionState,
    isSaving: loadingAction === "save_draft",
  });
  const sourcePreferenceOptions = useMemo(
    () => buildSourcePreferenceOptions(draftState?.source_candidates ?? []),
    [draftState?.source_candidates],
  );
  const showStaleWarning = Boolean(
    draftState?.staleness?.is_stale &&
    acknowledgedStaleDraftRunId !== draftState?.draft_run_id,
  );

  const chat = useStationaryEnergyChatMessages(decisionReviewContext);
  const {
    chatMessages,
    setChatMessages,
    appendTextMessage,
    removeInventorySaveConfirmationMessages,
    removeBulkReviewConfirmationMessages,
    removeStagedReviewUpdateConfirmationMessages,
    appendInventorySaveConfirmation,
    appendAssistantDelta,
    removeEmptyAssistantTail,
  } = chat;

  useEffect(() => {
    if (!canSaveAcceptedRowsToInventory) {
      removeInventorySaveConfirmationMessages();
      return;
    }

    const pendingMessage = pendingInventorySaveConfirmationMessageRef.current;
    if (pendingMessage !== undefined) {
      pendingInventorySaveConfirmationMessageRef.current = undefined;
      removeInventorySaveConfirmationMessages();
      if (pendingMessage) {
        appendTextMessage("assistant", pendingMessage);
      }
      appendInventorySaveConfirmation();
    }
  }, [
    appendInventorySaveConfirmation,
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    removeInventorySaveConfirmationMessages,
  ]);
  const { handleToolResult, activeToolName, setActiveToolName } =
    useStationaryEnergyToolResults({
      t,
      draftState,
      decisionReviewContext,
      canSaveAcceptedRowsToInventory,
      canSaveAcceptedRowsToInventoryRef,
      lastUserChatContentRef,
      pendingInventorySaveConfirmationMessageRef,
      setAcknowledgedStaleDraftRunId,
      refreshDraftStatusSilently,
      clearError,
      showError,
      updatePendingDraftStartResume,
      messages: chat,
    });

  const { startStream, stopStream } = useSSEStream({
    forceEventStream: true,
    onMessage: (content) => {
      appendAssistantDelta(content);
    },
    onToolResult: handleToolResult,
    onComplete: () => {
      removeEmptyAssistantTail();
      setActiveToolName(null);
      setLoadingAction(null);
    },
    onError: (error) => {
      removeEmptyAssistantTail();
      setActiveToolName(null);
      showError(
        translateMessage(t, error) || t("error-failed-to-send-message"),
      );
      setLoadingAction(null);
    },
  });

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
  ]);

  const choosePreference = useCallback(
    (preference: SourcePreferenceCommand): void => {
      setSourcePreference(preference);
      appendTextMessage("user", buildSourcePreferenceLabel(t, preference));
      appendTextMessage("assistant", buildSourcePreferenceReply(t, preference));
    },
    [appendTextMessage, t],
  );

  const continueStaleDraft = useCallback((): void => {
    if (!draftState?.draft_run_id) {
      return;
    }
    setAcknowledgedStaleDraftRunId(draftState.draft_run_id);
  }, [draftState]);

  const resetConversationState = useCallback((): void => {
    resetDraftStartResume();
    setChatMessages([]);
    setSourcePreference(null);
    clearError();
  }, [clearError, resetDraftStartResume, setChatMessages]);

  const startOver = useCallback((): void => {
    clearStoredDraftContext(inventoryId);
    setDraftState(null);
    setDecisionState({});
    setResolvedProposalIds(new Set());
    setThreadId(null);
    resetConversationState();
    setAcknowledgedStaleDraftRunId(null);
  }, [inventoryId, resetConversationState]);

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

  const { saveDraft, saveToInventory } = useStationaryEnergyReviewSave({
    draftState,
    decisionState,
    resolvedProposalIds,
    inventoryId,
    canPersistDraft,
    canSaveAcceptedRowsToInventory,
    clearError,
    showError,
    setLoadingAction,
    appendTextMessage,
    refreshDraftStatus,
    t,
  });

  const requestSaveToInventoryConfirmation = useCallback((): void => {
    if (!canSaveAcceptedRowsToInventory) {
      pendingInventorySaveConfirmationMessageRef.current = undefined;
      appendTextMessage("assistant", t("chat-save-inventory-blocked"));
      return;
    }
    pendingInventorySaveConfirmationMessageRef.current = undefined;
    appendTextMessage("assistant", t("chat-save-inventory-confirm"));
    appendInventorySaveConfirmation();
  }, [
    appendInventorySaveConfirmation,
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    t,
  ]);

  const confirmSaveToInventory = useCallback((): void => {
    pendingInventorySaveConfirmationMessageRef.current = undefined;
    removeInventorySaveConfirmationMessages();
    appendTextMessage("user", t("chat-save-inventory-confirmed"));
    void saveToInventory();
  }, [
    appendTextMessage,
    removeInventorySaveConfirmationMessages,
    saveToInventory,
    t,
  ]);

  const cancelSaveToInventoryConfirmation = useCallback((): void => {
    pendingInventorySaveConfirmationMessageRef.current = undefined;
    removeInventorySaveConfirmationMessages();
    appendTextMessage("assistant", t("chat-save-inventory-canceled"));
  }, [appendTextMessage, removeInventorySaveConfirmationMessages, t]);

  const sendChatMessage = useCallback(
    async (
      rawContent: string,
      options: {
        confirmedBulkReviewChoices?: StationaryEnergyToolChoiceSummary[];
        confirmedRollbackReviewChoices?: StationaryEnergyToolChoiceSummary[];
        // Re-send an earlier request without showing it again in the chat.
        resumeAfterDraftStart?: boolean;
      } = {},
    ): Promise<void> => {
      const {
        confirmedBulkReviewChoices,
        confirmedRollbackReviewChoices,
        resumeAfterDraftStart = false,
      } = options;
      const content = rawContent.trim();
      if (!content || loadingAction === "chat") {
        return;
      }

      clearError();
      // Follow-up messages do not cancel an earlier request. Only its automatic
      // continuation or an explicit user action consumes the queue.
      if (resumeAfterDraftStart) {
        if (!isPendingDraftStartResume()) {
          return;
        }
        updatePendingDraftStartResume(null);
      }
      if (!resumeAfterDraftStart) {
        setChatInput("");
        appendTextMessage("user", content);
        lastUserChatContentRef.current = content;
      }

      appendTextMessage("assistant", "");
      setLoadingAction("chat");

      try {
        const nextThreadId = await ensureThreadId(true);
        await startStream("/api/v1/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildStationaryEnergyChatRequest({
              cityId,
              cityName,
              content,
              confirmedBulkReviewChoices: confirmedBulkReviewChoicePayload(
                confirmedBulkReviewChoices ?? [],
              ),
              confirmedRollbackReviewChoices:
                confirmedRollbackReviewChoicePayload(
                  confirmedRollbackReviewChoices ?? [],
                ),
              decisionReviewContext,
              draftState,
              focusedDecisionState,
              focusedProposalId: effectiveFocusedProposalId,
              inventoryId,
              inventoryYear,
              resumeAfterDraftStart,
              threadId: nextThreadId,
            }),
          ),
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          removeEmptyAssistantTail();
          showError(
            resolveErrorMessage(t, error, "error-failed-to-send-message"),
          );
        }
        setLoadingAction(null);
      }
    },
    [
      appendTextMessage,
      cityId,
      cityName,
      clearError,
      decisionReviewContext,
      focusedDecisionState,
      draftState,
      effectiveFocusedProposalId,
      ensureThreadId,
      inventoryId,
      inventoryYear,
      loadingAction,
      removeEmptyAssistantTail,
      showError,
      startStream,
      t,
      updatePendingDraftStartResume,
      isPendingDraftStartResume,
    ],
  );

  const submitChat = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      await sendChatMessage(chatInput);
    },
    [chatInput, sendChatMessage],
  );

  // When the agent started a run for a request, re-send that request once the
  // run is ready and the start turn has finished streaming, so the agent
  // answers it with the new run data and review tools. The existing review
  // cards appear as usual when the run loads.
  const draftStatus = draftState?.status;
  // A run that failed or finished elsewhere has nothing left to resume.
  const awaitingDraftStartResume = Boolean(
    pendingDraftStartResume &&
    draftRunId === pendingDraftStartResume.draftRunId &&
    draftStatus &&
    !hasTerminalDraftStatus(draftStatus),
  );
  useEffect(() => {
    const pending = pendingDraftStartResume;
    if (
      !pending ||
      !awaitingDraftStartResume ||
      !draftStatus ||
      !canReviewDraftStatus(draftStatus) ||
      loadingAction === "chat"
    ) {
      return;
    }
    // Wait for any follow-up chat turn to finish. The ref also guards a cancel
    // action that happens before React cleans up this scheduled continuation.
    const timeout = window.setTimeout(() => {
      if (!isPendingDraftStartResume(pending)) {
        return;
      }
      void sendChatMessage(pending.content, { resumeAfterDraftStart: true });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [
    awaitingDraftStartResume,
    draftStatus,
    loadingAction,
    pendingDraftStartResume,
    isPendingDraftStartResume,
    sendChatMessage,
  ]);

  const lastChatMessage = chatMessages[chatMessages.length - 1];
  const chatActivityLabel = resolveChatActivityLabel(t, {
    activeToolName,
    awaitingDraftStartResume,
    isChatStreaming: loadingAction === "chat",
    replyTextVisible:
      lastChatMessage?.kind === "text" &&
      lastChatMessage.role === "assistant" &&
      lastChatMessage.text.trim().length > 0,
  });

  const confirmBulkReviewChanges = useCallback(
    (choices: StationaryEnergyToolChoiceSummary[]): void => {
      removeBulkReviewConfirmationMessages();
      removeStagedReviewUpdateConfirmationMessages();
      void sendChatMessage(t("chat-bulk-review-confirmed"), {
        confirmedBulkReviewChoices: choices,
      });
    },
    [
      removeBulkReviewConfirmationMessages,
      removeStagedReviewUpdateConfirmationMessages,
      sendChatMessage,
      t,
    ],
  );

  const cancelBulkReviewChanges = useCallback((): void => {
    removeBulkReviewConfirmationMessages();
    appendTextMessage("assistant", t("chat-bulk-review-canceled"));
    if (canSaveAcceptedRowsToInventory) {
      requestSaveToInventoryConfirmation();
    }
  }, [
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    removeBulkReviewConfirmationMessages,
    requestSaveToInventoryConfirmation,
    t,
  ]);

  const confirmStagedReviewRollback = useCallback(
    (choices: StationaryEnergyToolChoiceSummary[]): void => {
      removeStagedReviewUpdateConfirmationMessages();
      void sendChatMessage(t("chat-staged-review-rollback-confirmed"), {
        confirmedRollbackReviewChoices: choices,
      });
    },
    [removeStagedReviewUpdateConfirmationMessages, sendChatMessage, t],
  );

  const cancelStagedReviewUpdate = useCallback((): void => {
    removeStagedReviewUpdateConfirmationMessages();
    appendTextMessage("assistant", t("chat-staged-review-update-canceled"));
  }, [appendTextMessage, removeStagedReviewUpdateConfirmationMessages, t]);

  const startDraftFromChat = useCallback((): void => {
    appendTextMessage("user", t("chat-start-yes-draft"));
    void startDraft();
  }, [appendTextMessage, startDraft, t]);

  const startDraftFromArtifact = useCallback((): void => {
    if (draftState) {
      resetConversationState();
    }
    void startDraft();
  }, [draftState, resetConversationState, startDraft]);

  const refreshActiveDraft = useCallback((): void => {
    if (!draftState) {
      return;
    }
    void refreshDraftStatus(draftState.draft_run_id);
  }, [draftState, refreshDraftStatus]);

  const selectDraft = useCallback(
    (draftRunId: string): void => {
      if (draftRunId === draftState?.draft_run_id) {
        return;
      }
      resetConversationState();
      void refreshDraftStatus(draftRunId);
    },
    [draftState?.draft_run_id, refreshDraftStatus, resetConversationState],
  );

  return {
    actions: {
      cancelDraftStartResume,
      chooseDecision,
      choosePreference,
      continueStaleDraft,
      confirmBulkReviewChanges,
      cancelBulkReviewChanges,
      confirmStagedReviewRollback,
      cancelStagedReviewUpdate,
      confirmSaveToInventory,
      requestSaveToInventoryConfirmation,
      cancelSaveToInventoryConfirmation,
      editDecision,
      refreshActiveDraft,
      saveDraft: () => void saveDraft(),
      saveToInventory: () => void saveToInventory(),
      selectDraft,
      sendChatMessage: (content: string) => void sendChatMessage(content),
      setChatInput,
      setFocusedProposal,
      startDraftFromArtifact,
      startDraftFromChat,
      startOver,
      stopChat: stopStream,
      submitChat: (event) => void submitChat(event),
    },
    state: {
      activeDraftRunId: draftState?.draft_run_id ?? null,
      activeProposalId: activeDecision?.proposal_id ?? null,
      canPersistDraftReview: canPersistDraft,
      canSaveToInventory: canSaveAcceptedRowsToInventory,
      chatActivityLabel,
      chatInput,
      chatMessages,
      counts,
      decisionReviewContext,
      decisionState,
      draftListLoading,
      draftRuns,
      draftState,
      draftStatus: draftState?.status ?? "not_started",
      errorMessage,
      errorRecoveryAction,
      focusedProposalId: effectiveFocusedProposalId,
      hasDraft: Boolean(draftState),
      hasSourceBackedProposals,
      loadingAction,
      pendingDecisionCount: pendingDecisionProposals.length,
      pendingDraftStartRequest: pendingDraftStartResume?.content ?? null,
      draftStartResumeNotice,
      resolvedProposalIds,
      rows,
      showStaleWarning,
      sourcePreference,
      sourcePreferenceOptions,
      stage,
      staleDraft: draftState?.staleness ?? null,
      unresolvedCount: unresolvedBlockingIds.length,
    },
  };
}
