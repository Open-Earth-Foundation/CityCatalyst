"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createChatThread,
  fetchDraftRuns,
  fetchDraftStatus,
  fetchResumedDraft,
  persistReviewDecisionPayload,
  saveAcceptedDraftRows,
  startDraftRun,
} from "@/components/StationaryEnergyDraft/stationary-energy-draft-api";
import {
  addResolvedProposalId,
  buildSourcePreferenceReply,
  buildStationaryEnergyChatRequest,
  hasTerminalDraftStatus,
  mergeDecisionReviewMessages,
  nextDecisionState,
  removeResolvedProposalId,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import {
  appendAssistantDeltaToMessages,
  createTextMessage,
  removeEmptyAssistantTailFromMessages,
  type ChatMessage,
  type ChatTextMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import {
  buildArtifactRows,
  buildDecisionReviewContext,
  buildInitialDecisionState,
  buildReviewDecisionPayload,
  buildSourcePreferenceOptions,
  canPersistDraftReview,
  canSaveDraft,
  countDraftProposals,
  deriveDraftStage,
  hasDraftReviewChanges,
  pendingDecisionReviewProposals,
  resolvedProposalIdsFromReview,
  type ArtifactRow,
  type DecisionReviewContext,
  type DraftCounts,
  type DraftStage,
  unresolvedBlockingProposalIds,
} from "@/components/StationaryEnergyDraft/flow";
import { resolveStationaryEnergyDraftResume } from "@/components/StationaryEnergyDraft/resume";
import {
  clearStoredDraftContext,
  writeStoredDraftContext,
} from "@/components/StationaryEnergyDraft/storage";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftListItem,
  DraftProposal,
  DraftStatusResponse,
  SaveResponse,
} from "@/components/StationaryEnergyDraft/types";
import { useSSEStream } from "@/hooks/useSSEStream";

export type LoadingAction =
  | "start"
  | "refresh"
  | "save_draft"
  | "save_inventory"
  | "chat"
  | null;

type UseStationaryEnergyChatArtifactControllerParams = {
  cityId: string;
  featureEnabled: boolean;
  initialStage: DraftStage;
  inventoryId: string;
  lng: string;
  queryDraftRunId: string | null;
};

export type StationaryEnergyChatArtifactControllerState = {
  activeDraftRunId: string | null;
  activeProposalId: string | null;
  canPersistDraftReview: boolean;
  canSaveToInventory: boolean;
  chatInput: string;
  chatMessages: ChatMessage[];
  counts: DraftCounts;
  decisionReviewContext: DecisionReviewContext[];
  decisionState: Record<string, DraftDecisionState>;
  draftListLoading: boolean;
  draftRuns: DraftListItem[];
  draftState: DraftStatusResponse | null;
  draftStatus: string;
  errorMessage: string | null;
  hasDraft: boolean;
  hasSourceBackedProposals: boolean;
  loadingAction: LoadingAction;
  pendingDecisionCount: number;
  resolvedProposalIds: Set<string>;
  rows: ArtifactRow[];
  showStaleWarning: boolean;
  sourcePreference: string | null;
  sourcePreferenceOptions: string[];
  stage: DraftStage;
  staleDraft: DraftStatusResponse["staleness"];
  unresolvedCount: number;
};

export type StationaryEnergyChatArtifactControllerActions = {
  chooseDecision: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  choosePreference: (preference: string) => void;
  continueStaleDraft: () => void;
  editDecision: (proposalId: string) => void;
  refreshActiveDraft: () => void;
  saveDraft: () => void;
  saveToInventory: () => void;
  selectDraft: (draftRunId: string) => void;
  setChatInput: (value: string) => void;
  startDraftFromArtifact: () => void;
  startDraftFromChat: () => void;
  startOver: () => void;
  stopChat: () => void;
  submitChat: (event: FormEvent<HTMLFormElement>) => void;
};

export type StationaryEnergyChatArtifactController = {
  actions: StationaryEnergyChatArtifactControllerActions;
  state: StationaryEnergyChatArtifactControllerState;
};

const EMPTY_RESOLVED_PROPOSALS = new Set<string>();

export function useStationaryEnergyChatArtifactController(
  params: UseStationaryEnergyChatArtifactControllerParams,
): StationaryEnergyChatArtifactController {
  const {
    cityId,
    featureEnabled,
    initialStage,
    inventoryId,
    lng,
    queryDraftRunId,
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [draftRuns, setDraftRuns] = useState<DraftListItem[]>([]);
  const [draftListLoading, setDraftListLoading] = useState(false);
  const [resumeAttempted, setResumeAttempted] = useState(false);
  const [sourcePreference, setSourcePreference] = useState<string | null>(null);
  const [acknowledgedStaleDraftRunId, setAcknowledgedStaleDraftRunId] =
    useState<string | null>(null);

  const applyDraftState = useCallback(
    (payload: DraftStatusResponse) => {
      setDraftState(payload);
      setDecisionState(buildInitialDecisionState(payload));
      setResolvedProposalIds(resolvedProposalIdsFromReview(payload));
      setThreadId(payload.thread_id ?? null);
      if (!payload.staleness?.is_stale) {
        setAcknowledgedStaleDraftRunId(null);
      }
      if (hasTerminalDraftStatus(payload.status)) {
        clearStoredDraftContext(inventoryId);
      } else {
        writeStoredDraftContext(inventoryId, {
          draftRunId: payload.draft_run_id,
          threadId: payload.thread_id ?? null,
        });
      }
    },
    [inventoryId],
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

  const resumeDraftFromServer = useCallback(
    async (): Promise<DraftStatusResponse | null> => {
      const payload = await fetchResumedDraft({ cityId, inventoryId });
      if (!payload) {
        return null;
      }
      applyDraftState(payload);
      await loadDraftRuns();
      return payload;
    },
    [applyDraftState, cityId, inventoryId, loadDraftRuns],
  );

  useEffect(() => {
    if (!featureEnabled || resumeAttempted) {
      return;
    }

    setResumeAttempted(true);
    void resolveStationaryEnergyDraftResume({
      inventoryId,
      queryDraftRunId,
      refreshDraftStatus,
      resumeDraftFromServer,
    }).catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to resume draft",
      );
    });
  }, [
    featureEnabled,
    inventoryId,
    queryDraftRunId,
    refreshDraftStatus,
    resumeAttempted,
    resumeDraftFromServer,
  ]);

  useEffect(() => {
    if (!featureEnabled) {
      return;
    }
    void loadDraftRuns().catch((error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load Stationary Energy drafts",
      );
    });
  }, [featureEnabled, loadDraftRuns]);

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
  const rows = useMemo(() => buildArtifactRows(draftState), [draftState]);
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
      }),
    [draftState],
  );
  const hasSourceBackedProposals = useMemo(
    () => decisionReviewContext.length > 0,
    [decisionReviewContext],
  );
  const activeDecision = pendingDecisionProposals[0] ?? null;
  const canSaveToInventory = canSaveDraft({
    draftState,
    resolvedProposalIds,
    decisionState,
    isSaving: loadingAction === "save_inventory",
  });
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

  useEffect(() => {
    setChatMessages((current) =>
      mergeDecisionReviewMessages(current, decisionReviewContext),
    );
  }, [decisionReviewContext]);

  const appendChatMessage = useCallback((message: ChatTextMessage): void => {
    setChatMessages((current) => [...current, message]);
  }, []);

  const appendTextMessage = useCallback(
    (role: ChatTextMessage["role"], text: string): void => {
      appendChatMessage(createTextMessage(role, text));
    },
    [appendChatMessage],
  );

  const appendAssistantDelta = useCallback((delta: string): void => {
    setChatMessages((current) => appendAssistantDeltaToMessages(current, delta));
  }, []);

  const removeEmptyAssistantTail = useCallback((): void => {
    setChatMessages((current) => removeEmptyAssistantTailFromMessages(current));
  }, []);

  const { startStream, stopStream } = useSSEStream({
    onMessage: (content) => {
      appendAssistantDelta(content);
    },
    onComplete: () => {
      setLoadingAction(null);
    },
    onError: (error) => {
      removeEmptyAssistantTail();
      setErrorMessage(error);
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
        setErrorMessage(
          "Clima chat history is unavailable, but the draft can still run.",
        );
        return null;
      } finally {
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
        }
      }
    },
    [draftState?.thread_id, inventoryId, threadId],
  );

  const startDraft = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
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
        throw new Error("Draft start response did not include draft_run_id.");
      }
      await refreshDraftStatus(draftRunId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start draft",
      );
    } finally {
      setLoadingAction(null);
    }
  }, [cityId, ensureThreadId, inventoryId, lng, refreshDraftStatus]);

  const choosePreference = useCallback(
    (preference: string): void => {
      setSourcePreference(preference);
      appendTextMessage("user", preference);
      appendTextMessage("assistant", buildSourcePreferenceReply(preference));
    },
    [appendTextMessage],
  );

  const continueStaleDraft = useCallback((): void => {
    if (!draftState?.draft_run_id) {
      return;
    }
    setAcknowledgedStaleDraftRunId(draftState.draft_run_id);
  }, [draftState?.draft_run_id]);

  const resetConversationState = useCallback((): void => {
    setChatMessages([]);
    setSourcePreference(null);
    setErrorMessage(null);
  }, []);

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
      _label = "Selected",
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

  const persistReviewDecisions = useCallback(
    async (targetDraftState: DraftStatusResponse): Promise<unknown> => {
      return persistReviewDecisionPayload({
        draftRunId: targetDraftState.draft_run_id,
        inventoryId,
        decisions: buildReviewDecisionPayload({
          draftState: targetDraftState,
          decisionState,
        }),
      });
    },
    [decisionState, inventoryId],
  );

  const saveDraft = useCallback(async (): Promise<void> => {
    if (!draftState || !canPersistDraft) {
      return;
    }

    setErrorMessage(null);
    setLoadingAction("save_draft");
    try {
      await persistReviewDecisions(draftState);
      appendTextMessage(
        "assistant",
        "Draft saved in Clima. You can reopen it later from the draft list.",
      );
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save Stationary Energy draft",
      );
    } finally {
      setLoadingAction(null);
    }
  }, [
    appendTextMessage,
    canPersistDraft,
    draftState,
    persistReviewDecisions,
    refreshDraftStatus,
  ]);

  const saveToInventory = useCallback(async (): Promise<void> => {
    if (!draftState || !canSaveToInventory) {
      return;
    }

    setErrorMessage(null);
    setLoadingAction("save_inventory");
    try {
      if (
        hasDraftReviewChanges({
          draftState,
          decisionState,
        })
      ) {
        await persistReviewDecisions(draftState);
      }

      const payload: SaveResponse = await saveAcceptedDraftRows({
        draftRunId: draftState.draft_run_id,
        inventoryId,
      });
      appendTextMessage(
        "assistant",
        payload.status === "saved"
          ? "Saved. Accepted rows are now committed to the inventory."
          : `Save finished with status: ${payload.status}.`,
      );
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save accepted rows",
      );
    } finally {
      setLoadingAction(null);
    }
  }, [
    appendTextMessage,
    canSaveToInventory,
    decisionState,
    draftState,
    inventoryId,
    persistReviewDecisions,
    refreshDraftStatus,
  ]);

  const submitChat = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const content = chatInput.trim();
      if (!content || loadingAction === "chat") {
        return;
      }

      setChatInput("");
      appendTextMessage("user", content);
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
              content,
              decisionReviewContext,
              draftState,
              inventoryId,
              threadId: nextThreadId,
            }),
          ),
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          removeEmptyAssistantTail();
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to send message",
          );
        }
        setLoadingAction(null);
      }
    },
    [
      appendTextMessage,
      chatInput,
      cityId,
      decisionReviewContext,
      draftState,
      ensureThreadId,
      inventoryId,
      loadingAction,
      removeEmptyAssistantTail,
      startStream,
    ],
  );

  const startDraftFromChat = useCallback((): void => {
    appendTextMessage("user", "Yes, draft them");
    void startDraft();
  }, [appendTextMessage, startDraft]);

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
      chooseDecision,
      choosePreference,
      continueStaleDraft,
      editDecision,
      refreshActiveDraft,
      saveDraft: () => void saveDraft(),
      saveToInventory: () => void saveToInventory(),
      selectDraft,
      setChatInput,
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
      canSaveToInventory,
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
      hasDraft: Boolean(draftState),
      hasSourceBackedProposals,
      loadingAction,
      pendingDecisionCount: pendingDecisionProposals.length,
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
