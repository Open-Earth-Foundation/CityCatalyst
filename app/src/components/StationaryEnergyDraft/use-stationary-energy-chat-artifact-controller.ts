"use client";

import type { TFunction } from "i18next";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  buildFocusedDecisionStatePayload,
  buildStationaryEnergyChatRequest,
  type ConfirmedBulkReviewChoicePayload,
  type ConfirmedRollbackReviewChoicePayload,
  hasTerminalDraftStatus,
  isStationaryEnergyStartDraftToolResult,
  mergeDecisionReviewMessages,
  nextDecisionState,
  resolveInventorySaveConfirmationRequest,
  resolveStationaryEnergyStartDraftFailureMessage,
  resolveStationaryEnergyToolMessage,
  removeResolvedProposalId,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import {
  buildSourcePreferenceLabel,
  buildSourcePreferenceReply,
  type SourcePreferenceCommand,
} from "@/components/StationaryEnergyDraft/source-preference";
import {
  appendAssistantDeltaToMessages,
  createBulkReviewConfirmationMessage,
  createInventorySaveConfirmationMessage,
  createStagedReviewUpdateConfirmationMessage,
  createStationaryEnergyToolSummaryMessage,
  createTextMessage,
  removeEmptyAssistantTailFromMessages,
  type ChatMessage,
  type ChatTextMessage,
  type StationaryEnergyToolChoiceSummary,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import {
  buildInventorySaveReviewDecisionPayload,
  buildArtifactRows,
  buildDecisionReviewContext,
  buildInitialDecisionState,
  buildReviewDecisionPayload,
  buildSourcePreferenceOptions,
  canPersistDraftReview,
  canSaveToInventory,
  countDraftProposals,
  deriveDraftStage,
  hasInventorySaveReviewChanges,
  pendingDecisionReviewProposals,
  resolvedProposalIdsFromReview,
  type ArtifactRow,
  type DecisionOption,
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
type ErrorRecoveryAction = "start_draft";

type UseStationaryEnergyChatArtifactControllerParams = {
  cityId: string;
  featureEnabled: boolean;
  initialStage: DraftStage;
  inventoryId: string;
  lng: string;
  queryDraftRunId: string | null;
  t: TFunction;
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
  errorRecoveryAction: ErrorRecoveryAction | null;
  focusedProposalId: string | null;
  hasDraft: boolean;
  hasSourceBackedProposals: boolean;
  loadingAction: LoadingAction;
  pendingDecisionCount: number;
  resolvedProposalIds: Set<string>;
  rows: ArtifactRow[];
  showStaleWarning: boolean;
  sourcePreference: SourcePreferenceCommand | null;
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
  choosePreference: (preference: SourcePreferenceCommand) => void;
  continueStaleDraft: () => void;
  confirmBulkReviewChanges: (
    choices: StationaryEnergyToolChoiceSummary[],
  ) => void;
  cancelBulkReviewChanges: () => void;
  confirmStagedReviewRollback: (
    choices: StationaryEnergyToolChoiceSummary[],
  ) => void;
  cancelStagedReviewUpdate: () => void;
  confirmSaveToInventory: () => void;
  requestSaveToInventoryConfirmation: () => void;
  cancelSaveToInventoryConfirmation: () => void;
  editDecision: (proposalId: string) => void;
  refreshActiveDraft: () => void;
  saveDraft: () => void;
  saveToInventory: () => void;
  selectDraft: (draftRunId: string) => void;
  sendChatMessage: (content: string) => void;
  setChatInput: (value: string) => void;
  setFocusedProposal: (proposalId: string | null) => void;
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

function isStationaryEnergyReviewToolResult(tool: unknown): tool is {
  ui_event: string;
  action?: string;
  message_key?: string | null;
  message_params?: unknown;
  draft_run_id?: string;
  selected_choices?: unknown[];
  blocked_choices?: unknown[];
} {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as { ui_event?: unknown }).ui_event ===
      "stationary_energy_review_state_changed"
  );
}

function isStationaryEnergyInventoryConfirmationToolResult(
  tool: unknown,
): tool is {
  success: boolean;
  ui_event: string;
  message_key?: string | null;
  message_params?: unknown;
  error_code?: string | null;
} {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as { ui_event?: unknown }).ui_event ===
      "stationary_energy_inventory_save_confirmation_requested"
  );
}

function isStationaryEnergyBulkReviewConfirmationToolResult(
  tool: unknown,
): tool is {
  ui_event: string;
  message_key?: string | null;
  message_params?: unknown;
  draft_run_id?: string;
  pending_choices?: unknown[];
  blocked_choices?: unknown[];
} {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as { ui_event?: unknown }).ui_event ===
      "stationary_energy_review_bulk_confirmation_requested"
  );
}

function isStationaryEnergyStagedReviewUpdateConfirmationToolResult(
  tool: unknown,
): tool is {
  ui_event: string;
  message_key?: string | null;
  message_params?: unknown;
  draft_run_id?: string;
  pending_choices?: unknown[];
  blocked_choices?: unknown[];
} {
  if (typeof tool !== "object" || tool === null) {
    return false;
  }
  const uiEvent = (tool as { ui_event?: unknown }).ui_event;
  return (
    uiEvent === "stationary_energy_review_change_confirmation_requested" ||
    uiEvent === "stationary_energy_review_rollback_confirmation_requested"
  );
}

function normalizeToolChoiceSummary(
  choice: unknown,
): StationaryEnergyToolChoiceSummary {
  if (typeof choice !== "object" || choice === null) {
    return {};
  }
  const record = choice as Record<string, unknown>;
  return {
    proposal_id:
      typeof record.proposal_id === "string" ? record.proposal_id : null,
    candidate_id:
      typeof record.candidate_id === "string" ? record.candidate_id : null,
    selected_candidate_id:
      typeof record.selected_candidate_id === "string"
        ? record.selected_candidate_id
        : null,
    selected_source_id:
      typeof record.selected_source_id === "string"
        ? record.selected_source_id
        : null,
    target_label:
      typeof record.target_label === "string" ? record.target_label : null,
    source_label:
      typeof record.source_label === "string" ? record.source_label : null,
    source_short_label:
      typeof record.source_short_label === "string"
        ? record.source_short_label
        : null,
    source_meta:
      typeof record.source_meta === "string" ? record.source_meta : null,
    value: typeof record.value === "string" ? record.value : null,
    action: typeof record.action === "string" ? record.action : null,
    rationale: typeof record.rationale === "string" ? record.rationale : null,
    reason: typeof record.reason === "string" ? record.reason : null,
  };
}

function decisionOptionsForToolChoice(
  context: DecisionReviewContext,
): DecisionOption[] {
  return [
    ...(context.recommendedOption ? [context.recommendedOption] : []),
    ...context.alternativeOptions,
    context.leaveDraftOption,
  ];
}

function optionForToolChoice(
  choice: StationaryEnergyToolChoiceSummary,
  context: DecisionReviewContext,
): DecisionOption | null {
  if (choice.action === "leave_draft") {
    return context.leaveDraftOption;
  }

  const ids = new Set(
    [
      choice.selected_candidate_id,
      choice.candidate_id,
      choice.selected_source_id,
    ].filter((value): value is string => Boolean(value)),
  );
  const options = decisionOptionsForToolChoice(context);

  if (ids.size > 0) {
    const matched = options.find((option) => {
      const optionIds = [option.id, option.datasourceId].filter(
        (value): value is string => Boolean(value),
      );
      return optionIds.some((value) => ids.has(value));
    });
    if (matched) {
      return matched;
    }
  }

  if (choice.action === "accept" && context.recommendedOption) {
    return context.recommendedOption;
  }

  const sourceLabel = choice.source_label?.trim().toLowerCase();
  if (sourceLabel) {
    const matched = options.find((option) =>
      [option.label, option.shortLabel]
        .filter(Boolean)
        .some((value) => value.trim().toLowerCase() === sourceLabel),
    );
    if (matched) {
      return matched;
    }
  }

  return null;
}

function enrichToolChoiceSummary(
  choice: StationaryEnergyToolChoiceSummary,
  decisionReviewContext: DecisionReviewContext[],
): StationaryEnergyToolChoiceSummary {
  const context = decisionReviewContext.find(
    (candidate) => candidate.proposal_id === choice.proposal_id,
  );
  if (!context) {
    return choice;
  }

  const option = optionForToolChoice(choice, context);
  const isLeaveDraft = option?.action === "leave_draft";

  return {
    ...choice,
    target_label: choice.target_label ?? context.label,
    source_label: choice.source_label ?? option?.label ?? null,
    source_short_label:
      choice.source_short_label ??
      (isLeaveDraft
        ? (choice.source_label ?? option?.label ?? null)
        : (option?.shortLabel ?? null)),
    source_meta:
      choice.source_meta ?? (isLeaveDraft ? null : (option?.meta ?? null)),
    value: choice.value ?? (isLeaveDraft ? null : (option?.value ?? null)),
  };
}

function toolChoiceSignature(choice: unknown): Record<string, unknown> {
  if (typeof choice !== "object" || choice === null) {
    return {};
  }
  const record = choice as Record<string, unknown>;
  return {
    proposal_id: record.proposal_id,
    action: record.action,
    candidate_id: record.candidate_id,
    selected_source_id: record.selected_source_id,
    selected_candidate_id: record.selected_candidate_id,
    source_label: record.source_label,
    target_label: record.target_label,
    rationale: record.rationale,
    reason: record.reason,
  };
}

function stationaryEnergyToolResultSignature(tool: unknown): string | null {
  if (
    !isStationaryEnergyStartDraftToolResult(tool) &&
    !isStationaryEnergyReviewToolResult(tool) &&
    !isStationaryEnergyInventoryConfirmationToolResult(tool) &&
    !isStationaryEnergyBulkReviewConfirmationToolResult(tool) &&
    !isStationaryEnergyStagedReviewUpdateConfirmationToolResult(tool)
  ) {
    return null;
  }

  const record = tool as Record<string, unknown>;
  return JSON.stringify({
    ui_event: record.ui_event,
    action: record.action,
    success: record.success,
    draft_run_id: record.draft_run_id,
    error_code: record.error_code,
    message_key: record.message_key,
    message_params: record.message_params,
    selected_choices: Array.isArray(record.selected_choices)
      ? record.selected_choices.map(toolChoiceSignature)
      : [],
    pending_choices: Array.isArray(record.pending_choices)
      ? record.pending_choices.map(toolChoiceSignature)
      : [],
    blocked_choices: Array.isArray(record.blocked_choices)
      ? record.blocked_choices.map(toolChoiceSignature)
      : [],
  });
}

function confirmedBulkReviewChoicePayload(
  choices: StationaryEnergyToolChoiceSummary[],
): ConfirmedBulkReviewChoicePayload[] {
  return choices.reduce<ConfirmedBulkReviewChoicePayload[]>((acc, choice) => {
    const proposalId = choice.proposal_id ?? "";
    if (!proposalId) {
      return acc;
    }

    acc.push({
      proposal_id: proposalId,
      ...(choice.selected_candidate_id || choice.candidate_id
        ? {
            candidate_id:
              choice.selected_candidate_id ?? choice.candidate_id ?? "",
          }
        : {}),
      ...(choice.selected_source_id
        ? { selected_source_id: choice.selected_source_id }
        : {}),
      ...(choice.action ? { action: choice.action } : {}),
      ...(choice.rationale ? { rationale: choice.rationale } : {}),
    });
    return acc;
  }, []);
}

function confirmedRollbackReviewChoicePayload(
  choices: StationaryEnergyToolChoiceSummary[],
): ConfirmedRollbackReviewChoicePayload[] {
  return choices.reduce<ConfirmedRollbackReviewChoicePayload[]>(
    (acc, choice) => {
      const proposalId = choice.proposal_id ?? "";
      if (proposalId) {
        acc.push({ proposal_id: proposalId });
      }
      return acc;
    },
    [],
  );
}

function translateMessage(t: TFunction, message?: string | null): string {
  if (!message) {
    return "";
  }

  const translated = t(message);
  return translated === message ? message : translated;
}

function resolveErrorMessage(
  t: TFunction,
  error: unknown,
  fallbackKey: string,
): string {
  const message = error instanceof Error ? error.message : null;
  return translateMessage(t, message) || t(fallbackKey);
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRecoveryAction, setErrorRecoveryAction] =
    useState<ErrorRecoveryAction | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [draftRuns, setDraftRuns] = useState<DraftListItem[]>([]);
  const [draftListLoading, setDraftListLoading] = useState(false);
  const [resumeAttempted, setResumeAttempted] = useState(false);
  const [sourcePreference, setSourcePreference] =
    useState<SourcePreferenceCommand | null>(null);
  const handledToolResultSignaturesRef = useRef<Set<string>>(new Set());
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
    resumeAttempted,
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

  const removeInventorySaveConfirmationMessages = useCallback((): void => {
    setChatMessages((current) =>
      current.filter(
        (message) => message.kind !== "inventory_save_confirmation",
      ),
    );
  }, []);

  const removeBulkReviewConfirmationMessages = useCallback((): void => {
    setChatMessages((current) =>
      current.filter(
        (message) =>
          message.kind !== "stationary_energy_bulk_review_confirmation",
      ),
    );
  }, []);

  const removeStagedReviewUpdateConfirmationMessages = useCallback((): void => {
    setChatMessages((current) =>
      current.filter(
        (message) =>
          message.kind !==
          "stationary_energy_staged_review_update_confirmation",
      ),
    );
  }, []);

  useEffect(() => {
    if (!canSaveAcceptedRowsToInventory) {
      removeInventorySaveConfirmationMessages();
    }
  }, [canSaveAcceptedRowsToInventory, removeInventorySaveConfirmationMessages]);

  const appendInventorySaveConfirmation = useCallback((): void => {
    setChatMessages((current) => [
      ...current.filter(
        (message) => message.kind !== "inventory_save_confirmation",
      ),
      createInventorySaveConfirmationMessage(),
    ]);
  }, []);

  const appendBulkReviewConfirmation = useCallback(
    (params: {
      message?: string | null;
      choices: StationaryEnergyToolChoiceSummary[];
      blockedChoices: StationaryEnergyToolChoiceSummary[];
    }): void => {
      setChatMessages((current) => [
        ...current.filter(
          (message) =>
            message.kind !== "stationary_energy_bulk_review_confirmation",
        ),
        createBulkReviewConfirmationMessage(params),
      ]);
    },
    [],
  );

  const appendStagedReviewUpdateConfirmation = useCallback(
    (params: {
      mode: "change" | "rollback";
      message?: string | null;
      choices: StationaryEnergyToolChoiceSummary[];
      blockedChoices: StationaryEnergyToolChoiceSummary[];
    }): void => {
      setChatMessages((current) => [
        ...current.filter(
          (message) =>
            message.kind !==
            "stationary_energy_staged_review_update_confirmation",
        ),
        createStagedReviewUpdateConfirmationMessage(params),
      ]);
    },
    [],
  );

  const appendAssistantDelta = useCallback((delta: string): void => {
    setChatMessages((current) =>
      appendAssistantDeltaToMessages(current, delta),
    );
  }, []);

  const removeEmptyAssistantTail = useCallback((): void => {
    setChatMessages((current) => removeEmptyAssistantTailFromMessages(current));
  }, []);

  const handleToolResult = useCallback(
    (tool: unknown): void => {
      const signature = stationaryEnergyToolResultSignature(tool);
      removeEmptyAssistantTail();
      if (signature) {
        if (handledToolResultSignaturesRef.current.has(signature)) {
          return;
        }
        handledToolResultSignaturesRef.current.add(signature);
      }

      const toolDraftRunId =
        typeof (tool as { draft_run_id?: unknown } | null)?.draft_run_id ===
        "string"
          ? (tool as { draft_run_id: string }).draft_run_id
          : draftState?.draft_run_id;
      if (toolDraftRunId) {
        setAcknowledgedStaleDraftRunId(toolDraftRunId);
      }

      // The agent started a draft from chat: load the newly created draft so the
      // overview + review pane pick it up. Generation continues in the
      // background and the status poller fills in proposals as they arrive.
      const toolUiEvent =
        typeof (tool as { ui_event?: unknown } | null)?.ui_event === "string"
          ? (tool as { ui_event: string }).ui_event
          : null;
      if (toolUiEvent === "stationary_energy_draft_started") {
        const failureMessage = resolveStationaryEnergyStartDraftFailureMessage(
          t,
          tool,
        );
        if (failureMessage) {
          showError(failureMessage, "start_draft");
          return;
        }

        if (!isStationaryEnergyStartDraftToolResult(tool) || !toolDraftRunId) {
          showError(
            t("error-failed-to-start-stationary-energy-draft-retry"),
            "start_draft",
          );
          return;
        }

        clearError();
        void refreshDraftStatusSilently(toolDraftRunId).catch((error) => {
          showError(
            resolveErrorMessage(
              t,
              error,
              "error-failed-to-load-stationary-energy-draft-status",
            ),
          );
        });
        return;
      }

      if (isStationaryEnergyInventoryConfirmationToolResult(tool)) {
        const toolMessage = resolveStationaryEnergyToolMessage(
          t,
          tool,
          tool.success
            ? "tool-message-inventory-save-confirm"
            : "error-failed-to-save-accepted-stationary-energy-rows",
        );
        const confirmationRequest = resolveInventorySaveConfirmationRequest({
          canSaveToInventory: canSaveAcceptedRowsToInventory,
          toolSuccess: tool.success,
          toolMessage,
          blockedMessage: t("chat-save-inventory-blocked"),
        });
        removeInventorySaveConfirmationMessages();
        if (confirmationRequest.message) {
          appendTextMessage("assistant", confirmationRequest.message);
        }
        if (confirmationRequest.showConfirmation) {
          appendInventorySaveConfirmation();
        }
        return;
      }

      if (isStationaryEnergyBulkReviewConfirmationToolResult(tool)) {
        const choices = (tool.pending_choices ?? []).map((choice) =>
          enrichToolChoiceSummary(
            normalizeToolChoiceSummary(choice),
            decisionReviewContext,
          ),
        );
        const blockedChoices = (tool.blocked_choices ?? []).map((choice) =>
          enrichToolChoiceSummary(
            normalizeToolChoiceSummary(choice),
            decisionReviewContext,
          ),
        );
        const toolMessage = resolveStationaryEnergyToolMessage(
          t,
          tool,
          "primitives-bulk-review-confirm-description",
        );
        appendBulkReviewConfirmation({
          message: toolMessage,
          choices,
          blockedChoices,
        });
        return;
      }

      if (isStationaryEnergyStagedReviewUpdateConfirmationToolResult(tool)) {
        const choices = (tool.pending_choices ?? []).map((choice) =>
          enrichToolChoiceSummary(
            normalizeToolChoiceSummary(choice),
            decisionReviewContext,
          ),
        );
        const blockedChoices = (tool.blocked_choices ?? []).map((choice) =>
          enrichToolChoiceSummary(
            normalizeToolChoiceSummary(choice),
            decisionReviewContext,
          ),
        );
        const mode =
          tool.ui_event ===
          "stationary_energy_review_rollback_confirmation_requested"
            ? "rollback"
            : "change";
        const toolMessage = resolveStationaryEnergyToolMessage(
          t,
          tool,
          mode === "rollback"
            ? "primitives-staged-review-rollback-confirm-description"
            : "primitives-staged-review-change-confirm-description",
        );
        appendStagedReviewUpdateConfirmation({
          mode,
          message: toolMessage,
          choices,
          blockedChoices,
        });
        return;
      }

      if (!isStationaryEnergyReviewToolResult(tool)) {
        return;
      }

      const selectedChoices = (tool.selected_choices ?? []).map((choice) =>
        enrichToolChoiceSummary(
          normalizeToolChoiceSummary(choice),
          decisionReviewContext,
        ),
      );
      const blockedChoices = (tool.blocked_choices ?? []).map((choice) =>
        enrichToolChoiceSummary(
          normalizeToolChoiceSummary(choice),
          decisionReviewContext,
        ),
      );
      const toolMessage = resolveStationaryEnergyToolMessage(
        t,
        tool,
        "tool-message-generic-summary",
      );
      if (
        selectedChoices.length > 0 ||
        blockedChoices.length > 0 ||
        toolMessage
      ) {
        setChatMessages((current) => [
          ...current,
          createStationaryEnergyToolSummaryMessage({
            action: tool.action ?? "stationary_energy_review_tool",
            message: toolMessage,
            selectedChoices,
            blockedChoices,
          }),
        ]);
      }

      if (toolDraftRunId) {
        void refreshDraftStatusSilently(toolDraftRunId).catch((error) => {
          showError(
            resolveErrorMessage(
              t,
              error,
              "error-failed-to-load-stationary-energy-draft-status",
            ),
          );
        });
      }
    },
    [
      appendBulkReviewConfirmation,
      appendInventorySaveConfirmation,
      appendStagedReviewUpdateConfirmation,
      appendTextMessage,
      canSaveAcceptedRowsToInventory,
      clearError,
      decisionReviewContext,
      draftState?.draft_run_id,
      refreshDraftStatusSilently,
      removeEmptyAssistantTail,
      removeInventorySaveConfirmationMessages,
      showError,
      t,
    ],
  );

  const { startStream, stopStream } = useSSEStream({
    forceEventStream: true,
    onMessage: (content) => {
      appendAssistantDelta(content);
    },
    onToolResult: handleToolResult,
    onComplete: () => {
      removeEmptyAssistantTail();
      setLoadingAction(null);
    },
    onError: (error) => {
      removeEmptyAssistantTail();
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
    [draftState?.thread_id, inventoryId, showError, t, threadId],
  );

  const startDraft = useCallback(async (): Promise<void> => {
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
  }, [draftState?.draft_run_id]);

  const resetConversationState = useCallback((): void => {
    setChatMessages([]);
    setSourcePreference(null);
    clearError();
  }, [clearError]);

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

    clearError();
    setLoadingAction("save_draft");
    try {
      await persistReviewDecisions(draftState);
      appendTextMessage("assistant", t("chat-save-draft-success"));
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      showError(
        resolveErrorMessage(
          t,
          error,
          "error-failed-to-save-stationary-energy-draft-decisions",
        ),
      );
    } finally {
      setLoadingAction(null);
    }
  }, [
    appendTextMessage,
    canPersistDraft,
    clearError,
    draftState,
    persistReviewDecisions,
    refreshDraftStatus,
    showError,
    t,
  ]);

  const saveToInventory = useCallback(async (): Promise<void> => {
    if (!draftState || !canSaveAcceptedRowsToInventory) {
      return;
    }

    clearError();
    setLoadingAction("save_inventory");
    try {
      if (
        hasInventorySaveReviewChanges({
          draftState,
          decisionState,
          resolvedProposalIds,
        })
      ) {
        await persistReviewDecisionPayload({
          draftRunId: draftState.draft_run_id,
          inventoryId,
          decisions: buildInventorySaveReviewDecisionPayload({
            draftState,
            decisionState,
            resolvedProposalIds,
          }),
        });
      }

      const payload: SaveResponse = await saveAcceptedDraftRows({
        draftRunId: draftState.draft_run_id,
        inventoryId,
      });
      appendTextMessage(
        "assistant",
        payload.status === "saved"
          ? t("chat-save-inventory-success")
          : t("chat-save-inventory-status", { status: payload.status }),
      );
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      showError(
        resolveErrorMessage(
          t,
          error,
          "error-failed-to-save-accepted-stationary-energy-rows",
        ),
      );
    } finally {
      setLoadingAction(null);
    }
  }, [
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    clearError,
    decisionState,
    draftState,
    inventoryId,
    resolvedProposalIds,
    refreshDraftStatus,
    showError,
    t,
  ]);

  const requestSaveToInventoryConfirmation = useCallback((): void => {
    if (!canSaveAcceptedRowsToInventory) {
      appendTextMessage("assistant", t("chat-save-inventory-blocked"));
      return;
    }
    appendTextMessage("assistant", t("chat-save-inventory-confirm"));
    appendInventorySaveConfirmation();
  }, [
    appendInventorySaveConfirmation,
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    t,
  ]);

  const confirmSaveToInventory = useCallback((): void => {
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
    removeInventorySaveConfirmationMessages();
    appendTextMessage("assistant", t("chat-save-inventory-canceled"));
  }, [appendTextMessage, removeInventorySaveConfirmationMessages, t]);

  const sendChatMessage = useCallback(
    async (
      rawContent: string,
      confirmedBulkReviewChoices?: StationaryEnergyToolChoiceSummary[],
      confirmedRollbackReviewChoices?: StationaryEnergyToolChoiceSummary[],
    ): Promise<void> => {
      const content = rawContent.trim();
      if (!content || loadingAction === "chat") {
        return;
      }

      clearError();
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
      clearError,
      decisionReviewContext,
      focusedDecisionState,
      draftState,
      effectiveFocusedProposalId,
      ensureThreadId,
      inventoryId,
      loadingAction,
      removeEmptyAssistantTail,
      showError,
      startStream,
      t,
    ],
  );

  const submitChat = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      await sendChatMessage(chatInput);
    },
    [chatInput, sendChatMessage],
  );

  const confirmBulkReviewChanges = useCallback(
    (choices: StationaryEnergyToolChoiceSummary[]): void => {
      removeBulkReviewConfirmationMessages();
      removeStagedReviewUpdateConfirmationMessages();
      void sendChatMessage(t("chat-bulk-review-confirmed"), choices);
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
  }, [appendTextMessage, removeBulkReviewConfirmationMessages, t]);

  const confirmStagedReviewRollback = useCallback(
    (choices: StationaryEnergyToolChoiceSummary[]): void => {
      removeStagedReviewUpdateConfirmationMessages();
      void sendChatMessage(
        t("chat-staged-review-rollback-confirmed"),
        undefined,
        choices,
      );
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
