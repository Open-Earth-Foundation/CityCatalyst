"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSSEStream } from "@/hooks/useSSEStream";

import {
  clearStoredDraftContext,
  writeStoredDraftContext,
} from "./storage";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftListItem,
  DraftListResponse,
  DraftProposal,
  DraftStatusResponse,
  SaveResponse,
} from "./types";
import { readJson } from "./utils";
import {
  type ArtifactRow,
  type DecisionReviewContext,
  type DraftCounts,
  type DraftStage,
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
  unresolvedBlockingProposalIds,
} from "./flow";
import { resolveStationaryEnergyDraftResume } from "./resume";

export type LoadingAction =
  | "start"
  | "refresh"
  | "save_draft"
  | "save_inventory"
  | "chat"
  | null;

type ChatTextMessage = {
  id: string;
  kind: "text";
  role: "user" | "assistant";
  text: string;
};

type ChatDecisionReviewMessage = {
  id: string;
  kind: "decision_review";
  proposalId: string;
};

export type ChatMessage = ChatTextMessage | ChatDecisionReviewMessage;

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

const TERMINAL_DRAFT_STATUSES = new Set([
  "saved",
  "partially_saved",
  "no_changes",
  "failed",
]);
const EMPTY_RESOLVED_PROPOSALS = new Set<string>();

function createChatMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createTextMessage(
  role: ChatTextMessage["role"],
  text: string,
): ChatTextMessage {
  return {
    id: createChatMessageId(role),
    kind: "text",
    role,
    text,
  };
}

function createDecisionReviewMessage(
  proposalId: string,
): ChatDecisionReviewMessage {
  return {
    id: `decision-review-${proposalId}`,
    kind: "decision_review",
    proposalId,
  };
}

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
      if (TERMINAL_DRAFT_STATUSES.has(payload.status)) {
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
      const query = new URLSearchParams({
        city_id: cityId,
        inventory_id: inventoryId,
      });
      const response = await fetch(
        `/api/v1/stationary-energy-drafts?${query.toString()}`,
      );
      const payload = await readJson<DraftListResponse>(
        response,
        "Failed to load Stationary Energy drafts",
      );
      setDraftRuns(payload.drafts ?? []);
      return payload.drafts ?? [];
    } finally {
      setDraftListLoading(false);
    }
  }, [cityId, inventoryId]);

  const refreshDraftStatus = useCallback(
    async (draftRunId: string): Promise<DraftStatusResponse> => {
      setLoadingAction("refresh");
      try {
        const response = await fetch(
          `/api/v1/stationary-energy-drafts/${draftRunId}?inventory_id=${encodeURIComponent(inventoryId)}`,
        );
        const payload = await readJson<DraftStatusResponse>(
          response,
          "Failed to load Stationary Energy draft status",
        );
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
      const query = new URLSearchParams({
        city_id: cityId,
        inventory_id: inventoryId,
      });
      const response = await fetch(
        `/api/v1/stationary-energy-drafts/resume?${query.toString()}`,
      );
      if (response.status === 404) {
        return null;
      }
      const payload = await readJson<DraftStatusResponse>(
        response,
        "Failed to resume Stationary Energy draft",
      );
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
    if (decisionReviewContext.length === 0) {
      return;
    }
    setChatMessages((current) => {
      const existingProposalIds = new Set(
        current
          .filter((message): message is ChatDecisionReviewMessage => {
            return message.kind === "decision_review";
          })
          .map((message) => message.proposalId),
      );
      const additions = decisionReviewContext
        .filter((context) => !existingProposalIds.has(context.proposal_id))
        .map((context) => createDecisionReviewMessage(context.proposal_id));

      if (additions.length === 0) {
        return current;
      }
      return [...current, ...additions];
    });
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
    setChatMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];
      if (!last || last.kind !== "text" || last.role !== "assistant") {
        next.push(createTextMessage("assistant", delta));
      } else {
        next[next.length - 1] = { ...last, text: `${last.text}${delta}` };
      }
      return next;
    });
  }, []);

  const removeEmptyAssistantTail = useCallback((): void => {
    setChatMessages((current) => {
      const last = current[current.length - 1];
      if (
        last?.kind === "text" &&
        last.role === "assistant" &&
        !last.text.trim()
      ) {
        return current.slice(0, -1);
      }
      return current;
    });
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
        const response = await fetch("/api/v1/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            inventory_id: inventoryId,
            title: "Stationary Energy draft",
          }),
        });
        const payload = await readJson<{ threadId: string }>(
          response,
          "Failed to create Clima chat thread",
        );
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
      const response = await fetch("/api/v1/stationary-energy-drafts/start/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city_id: cityId,
          inventory_id: inventoryId,
          thread_id: nextThreadId ?? undefined,
          locale: lng,
        }),
      });
      const payload = await readJson<{ draft_run_id?: string }>(
        response,
        "Failed to start Stationary Energy draft",
      );
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
      appendTextMessage(
        "assistant",
        preference === "No preference"
          ? "Got it. I will keep the current source ranking."
          : `Got it. I will use ${preference.replace("Prefer ", "")} where it fits the reviewed source options.`,
      );
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
      setDecisionState((current) => ({
        ...current,
        [proposal.proposal_id]: {
          action,
          selectedSourceId,
          manualValue: current[proposal.proposal_id]?.manualValue ?? "",
          manualUnit: current[proposal.proposal_id]?.manualUnit ?? "",
          note: current[proposal.proposal_id]?.note ?? "",
        },
      }));
      setResolvedProposalIds((current) => {
        const next = new Set(current);
        next.add(proposal.proposal_id);
        return next;
      });
    },
    [],
  );

  const editDecision = useCallback((proposalId: string): void => {
    setResolvedProposalIds((current) => {
      const next = new Set(current);
      next.delete(proposalId);
      return next;
    });
  }, []);

  const persistReviewDecisions = useCallback(
    async (targetDraftState: DraftStatusResponse): Promise<unknown> => {
      const decisions = buildReviewDecisionPayload({
        draftState: targetDraftState,
        decisionState,
      });
      const reviewResponse = await fetch(
        `/api/v1/stationary-energy-drafts/${targetDraftState.draft_run_id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventory_id: inventoryId,
            decisions,
          }),
        },
      );
      return readJson(
        reviewResponse,
        "Failed to save Stationary Energy draft decisions",
      );
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

      const saveResponse = await fetch(
        `/api/v1/stationary-energy-drafts/${draftState.draft_run_id}/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventory_id: inventoryId,
          }),
        },
      );
      const payload = await readJson<SaveResponse>(
        saveResponse,
        "Failed to save accepted Stationary Energy rows",
      );
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
          body: JSON.stringify({
            threadId: nextThreadId,
            content,
            inventory_id: inventoryId,
            context: draftState
              ? {
                  stationary_energy_draft_run_id: draftState.draft_run_id,
                  draft_run_id: draftState.draft_run_id,
                  city_id: cityId,
                  inventory_id: inventoryId,
                  stationary_energy_interaction_mode: "free_text",
                  stationary_energy_pending_decision_reviews:
                    decisionReviewContext,
                }
              : undefined,
            options: draftState
              ? {
                  stationary_energy_draft_run_id: draftState.draft_run_id,
                  stationary_energy_pending_decision_review_count:
                    decisionReviewContext.length,
                  stationary_energy_ui_surfaces: [
                    "chat_text",
                    "decision_review_card",
                  ],
                }
              : {},
          }),
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
