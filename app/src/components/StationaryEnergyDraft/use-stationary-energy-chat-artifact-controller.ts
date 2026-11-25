"use client";

import {
  buildArtifactRows,
  buildDecisionReviewContext,
  buildSourcePreferenceOptions,
  canPersistDraftReview,
  canSaveToInventory,
  countDraftProposals,
  deriveDraftStage,
  pendingDecisionReviewProposals,
  unresolvedBlockingProposalIds,
} from "@/components/StationaryEnergyDraft/flow";
import {
  buildSourcePreferenceLabel,
  buildSourcePreferenceReply,
  type SourcePreferenceCommand,
} from "@/components/StationaryEnergyDraft/source-preference";
import { buildFocusedDecisionStatePayload } from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import type {
  ErrorRecoveryAction,
  LoadingAction,
  StationaryEnergyChatArtifactController,
  UseStationaryEnergyChatArtifactControllerParams,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import { useStationaryEnergyChatMessages } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-messages";
import { useStationaryEnergyChatStream } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-stream";
import { useStationaryEnergyDraftSession } from "@/components/StationaryEnergyDraft/use-stationary-energy-draft-session";
import { useStationaryEnergyPendingRequest } from "@/components/StationaryEnergyDraft/use-stationary-energy-pending-request";
import { useStationaryEnergyReviewConfirmations } from "@/components/StationaryEnergyDraft/use-stationary-energy-review-confirmations";
import { useStationaryEnergyReviewSave } from "@/components/StationaryEnergyDraft/use-stationary-energy-review-save";
import { useStationaryEnergyToolResults } from "@/components/StationaryEnergyDraft/use-stationary-energy-tool-results";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRecoveryAction, setErrorRecoveryAction] =
    useState<ErrorRecoveryAction | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [sourcePreference, setSourcePreference] =
    useState<SourcePreferenceCommand | null>(null);
  const pendingInventorySaveConfirmationMessageRef = useRef<
    string | null | undefined
  >(undefined);
  const lastUserChatContentRef = useRef<string | null>(null);
  const pendingRequest = useStationaryEnergyPendingRequest(inventoryId, t);
  const {
    pendingDraftStartResume,
    draftStartResumeNotice,
    resetDraftStartResume,
    updatePendingDraftStartResume,
    applyDraftResumeContext,
    cancelDraftStartResume,
  } = pendingRequest;
  const [focusedProposalId, setFocusedProposalId] = useState<string | null>(
    null,
  );

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

  const {
    draftState,
    decisionState,
    resolvedProposalIds,
    draftRuns,
    draftListLoading,
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
  } = useStationaryEnergyDraftSession({
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
  });

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
  const hasSourceBackedProposals = decisionReviewContext.length > 0;
  const activeDecision = pendingDecisionProposals[0] ?? null;
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
  }, [canSaveAcceptedRowsToInventory, canSaveAcceptedRowsToInventoryRef]);
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
  const { chatMessages, setChatMessages, appendTextMessage } = chat;

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

  const {
    chatInput,
    setChatInput,
    sendChatMessage,
    submitChat,
    stopStream,
    chatActivityLabel,
  } = useStationaryEnergyChatStream({
    cityId,
    cityName,
    inventoryId,
    inventoryYear,
    t,
    draftState,
    decisionReviewContext,
    focusedDecisionState,
    effectiveFocusedProposalId,
    loadingAction,
    setLoadingAction,
    clearError,
    showError,
    ensureThreadId,
    activeToolName,
    setActiveToolName,
    handleToolResult,
    lastUserChatContentRef,
    chat,
    pendingRequest,
  });

  const choosePreference = useCallback(
    (preference: SourcePreferenceCommand): void => {
      setSourcePreference(preference);
      appendTextMessage("user", buildSourcePreferenceLabel(t, preference));
      appendTextMessage("assistant", buildSourcePreferenceReply(t, preference));
    },
    [appendTextMessage, t],
  );

  const resetConversationState = useCallback((): void => {
    resetDraftStartResume();
    setChatMessages([]);
    setSourcePreference(null);
    clearError();
  }, [clearError, resetDraftStartResume, setChatMessages]);

  const startOver = useCallback((): void => {
    resetDraft();
    resetConversationState();
  }, [resetDraft, resetConversationState]);

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

  const {
    requestSaveToInventoryConfirmation,
    confirmSaveToInventory,
    cancelSaveToInventoryConfirmation,
    confirmBulkReviewChanges,
    cancelBulkReviewChanges,
    confirmStagedReviewRollback,
    cancelStagedReviewUpdate,
  } = useStationaryEnergyReviewConfirmations({
    t,
    canSaveAcceptedRowsToInventory,
    pendingInventorySaveConfirmationMessageRef,
    saveToInventory,
    sendChatMessage,
    chat,
  });

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
      setFocusedProposal: setFocusedProposalId,
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
