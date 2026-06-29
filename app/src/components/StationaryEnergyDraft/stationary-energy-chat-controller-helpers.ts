import type { TFunction } from "i18next";

import {
  createDecisionReviewMessage,
  type ChatMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import type {
  DecisionOption,
  DecisionReviewContext,
} from "@/components/StationaryEnergyDraft/flow";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftStatusResponse,
} from "@/components/StationaryEnergyDraft/types";

export type ConfirmedBulkReviewChoicePayload = {
  proposal_id: string;
  candidate_id?: string;
  selected_source_id?: string;
  action?: string;
  rationale?: string;
};

export type ConfirmedRollbackReviewChoicePayload = {
  proposal_id: string;
};

export type FocusedDecisionOptionPayload = {
  id: string;
  action: DraftDecisionAction;
  label: string;
  short_label: string;
  selected_source_id?: string | null;
  recommended: boolean;
};

export type FocusedDecisionStatePayload = {
  action: DraftDecisionAction;
  selected_option: FocusedDecisionOptionPayload | null;
};

export type StationaryEnergyStartDraftToolResult = {
  success: boolean;
  ui_event: "stationary_energy_draft_started";
  message_key?: string | null;
  message_params?: unknown;
  draft_run_id?: string | null;
  error_code?: string | null;
};

const TERMINAL_DRAFT_STATUSES = new Set([
  "saved",
  "partially_saved",
  "no_changes",
  "failed",
]);
const SOURCE_PREFERENCE_PREFIX = "source:";

export const NO_SOURCE_PREFERENCE = "__source_preference_none__";
export const START_CHOOSE_SOURCES = "__start_choose_sources__";
export const SET_EMPTY_NOTATION_PREFERENCE = "__set_empty_notation__";

const GENERIC_START_DRAFT_FAILURE_KEYS = new Set([
  "tool-error-generic",
  "tool-error-http",
  "tool-error-missing-token",
]);

type StationaryEnergyToolMessageParams = Record<
  string,
  string | number | boolean
>;

function isStationaryEnergyToolMessageParams(
  value: unknown,
): value is StationaryEnergyToolMessageParams {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) =>
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
  );
}

export function resolveStationaryEnergyToolMessage(
  t: TFunction,
  tool: {
    message?: string | null;
    message_key?: string | null;
    message_params?: unknown;
  },
  fallbackKey?: string,
): string | null {
  if (tool.message_key) {
    return t(
      tool.message_key,
      isStationaryEnergyToolMessageParams(tool.message_params)
        ? tool.message_params
        : {},
    );
  }

  return fallbackKey ? t(fallbackKey) : null;
}

export function isStationaryEnergyStartDraftToolResult(
  tool: unknown,
): tool is StationaryEnergyStartDraftToolResult {
  return (
    typeof tool === "object" &&
    tool !== null &&
    (tool as { ui_event?: unknown }).ui_event ===
      "stationary_energy_draft_started" &&
    typeof (tool as { success?: unknown }).success === "boolean"
  );
}

export function resolveStationaryEnergyStartDraftFailureMessage(
  t: TFunction,
  tool: unknown,
): string | null {
  if (!isStationaryEnergyStartDraftToolResult(tool) || tool.success) {
    return null;
  }

  if (
    tool.message_key &&
    !GENERIC_START_DRAFT_FAILURE_KEYS.has(tool.message_key)
  ) {
    return resolveStationaryEnergyToolMessage(
      t,
      tool,
      "error-failed-to-start-stationary-energy-draft-retry",
    );
  }

  return t("error-failed-to-start-stationary-energy-draft-retry");
}

export function hasTerminalDraftStatus(status: string): boolean {
  return TERMINAL_DRAFT_STATUSES.has(status);
}

export function mergeDecisionReviewMessages(
  current: ChatMessage[],
  decisionReviewContext: DecisionReviewContext[],
): ChatMessage[] {
  if (decisionReviewContext.length === 0) {
    return current;
  }

  const existingProposalIds = new Set(
    current
      .filter((message) => message.kind === "decision_review")
      .map((message) => message.proposalId),
  );
  const additions = decisionReviewContext
    .filter((context) => !existingProposalIds.has(context.proposal_id))
    .map((context) => createDecisionReviewMessage(context.proposal_id));

  return additions.length === 0 ? current : [...current, ...additions];
}

export function sourcePreferenceCommand(sourceName: string): string {
  return `${SOURCE_PREFERENCE_PREFIX}${sourceName}`;
}

function sourceNameFromPreference(preference: string): string | null {
  return preference.startsWith(SOURCE_PREFERENCE_PREFIX)
    ? preference.slice(SOURCE_PREFERENCE_PREFIX.length)
    : null;
}

export function buildSourcePreferenceLabel(
  t: TFunction,
  preference: string,
): string {
  if (preference === NO_SOURCE_PREFERENCE) {
    return t("chat-source-preference-no-preference");
  }
  if (preference === START_CHOOSE_SOURCES) {
    return t("chat-start-choose-sources");
  }
  if (preference === SET_EMPTY_NOTATION_PREFERENCE) {
    return t("chat-quick-reply-set-notation");
  }

  const sourceName = sourceNameFromPreference(preference);
  if (sourceName) {
    return t("chat-source-preference-prefer", {
      sourceName,
    });
  }

  return preference;
}

export function buildSourcePreferenceReply(
  t: TFunction,
  preference: string,
): string {
  if (preference === NO_SOURCE_PREFERENCE) {
    return t("chat-source-preference-reply-no-preference");
  }
  if (preference === START_CHOOSE_SOURCES) {
    return t("chat-start-choose-sources-reply");
  }
  if (preference === SET_EMPTY_NOTATION_PREFERENCE) {
    return t("chat-quick-reply-set-notation-reply");
  }

  const sourceName = sourceNameFromPreference(preference);
  if (sourceName) {
    return t("chat-source-preference-reply-prefer", {
      sourceName,
    });
  }

  return preference;
}

export function nextDecisionState(
  current: Record<string, DraftDecisionState>,
  proposalId: string,
  action: DraftDecisionAction,
  selectedSourceId = "",
): Record<string, DraftDecisionState> {
  return {
    ...current,
    [proposalId]: {
      action,
      selectedSourceId,
      manualValue: current[proposalId]?.manualValue ?? "",
      manualUnit: current[proposalId]?.manualUnit ?? "",
      note: current[proposalId]?.note ?? "",
    },
  };
}

export function addResolvedProposalId(
  current: Set<string>,
  proposalId: string,
): Set<string> {
  const next = new Set(current);
  next.add(proposalId);
  return next;
}

export function removeResolvedProposalId(
  current: Set<string>,
  proposalId: string,
): Set<string> {
  const next = new Set(current);
  next.delete(proposalId);
  return next;
}

function decisionOptionsForContext(
  context: DecisionReviewContext,
): DecisionOption[] {
  return [
    ...(context.recommendedOption ? [context.recommendedOption] : []),
    ...context.alternativeOptions,
    context.leaveDraftOption,
  ];
}

function selectedDecisionOption(
  context: DecisionReviewContext,
  decision?: DraftDecisionState,
): DecisionOption | null {
  if (!decision) {
    return null;
  }
  if (decision.action === "leave_draft") {
    return context.leaveDraftOption;
  }
  if (decision.action === "accept") {
    return context.recommendedOption;
  }
  if (decision.action !== "override_source") {
    return null;
  }
  return (
    decisionOptionsForContext(context).find(
      (option) =>
        option.action === "override_source" &&
        (option.id === decision.selectedSourceId ||
          option.datasourceId === decision.selectedSourceId),
    ) ?? null
  );
}

export function buildFocusedDecisionStatePayload(params: {
  decisionReviewContext: DecisionReviewContext[];
  decisionState: Record<string, DraftDecisionState>;
  focusedProposalId?: string | null;
  resolvedProposalIds: Set<string>;
}): FocusedDecisionStatePayload | undefined {
  const {
    decisionReviewContext,
    decisionState,
    focusedProposalId,
    resolvedProposalIds,
  } = params;
  if (!focusedProposalId) {
    return undefined;
  }

  if (!resolvedProposalIds.has(focusedProposalId)) {
    return undefined;
  }

  const context = decisionReviewContext.find(
    (review) => review.proposal_id === focusedProposalId,
  );
  if (!context) {
    return undefined;
  }

  const decision = decisionState[focusedProposalId];
  if (!decision) {
    return undefined;
  }

  const selectedOption = selectedDecisionOption(context, decision);
  return {
    action: decision.action,
    selected_option: selectedOption
      ? {
          id: selectedOption.id,
          action: selectedOption.action,
          label: selectedOption.label,
          short_label: selectedOption.shortLabel,
          selected_source_id: selectedOption.datasourceId ?? null,
          recommended: selectedOption.recommended,
        }
      : null,
  };
}

export function buildStationaryEnergyChatRequest(params: {
  cityId: string;
  content: string;
  confirmedBulkReviewChoices?: ConfirmedBulkReviewChoicePayload[];
  confirmedRollbackReviewChoices?: ConfirmedRollbackReviewChoicePayload[];
  decisionReviewContext: DecisionReviewContext[];
  draftState: DraftStatusResponse | null;
  focusedDecisionState?: FocusedDecisionStatePayload;
  focusedProposalId?: string | null;
  inventoryId: string;
  threadId: string | null;
}): Record<string, unknown> {
  const {
    cityId,
    content,
    confirmedBulkReviewChoices,
    confirmedRollbackReviewChoices,
    decisionReviewContext,
    draftState,
    focusedDecisionState,
    focusedProposalId,
    inventoryId,
    threadId,
  } = params;

  return {
    threadId,
    content,
    inventory_id: inventoryId,
    // Always identify the Stationary Energy draft surface (city + inventory +
    // interaction marker) so the agent can offer the start-draft tool even
    // before a draft exists. Only this page sends these, so the general chat is
    // unaffected.
    context: {
      city_id: cityId,
      inventory_id: inventoryId,
      stationary_energy_interaction_mode: "free_text",
      ...(draftState
        ? {
            stationary_energy_draft_run_id: draftState.draft_run_id,
            draft_run_id: draftState.draft_run_id,
            stationary_energy_pending_decision_reviews: decisionReviewContext,
            stationary_energy_focused_decision_state: focusedDecisionState,
            stationary_energy_focused_proposal_id: focusedProposalId,
            stationary_energy_confirmed_bulk_review_choices:
              confirmedBulkReviewChoices &&
              confirmedBulkReviewChoices.length > 0
                ? confirmedBulkReviewChoices
                : undefined,
            stationary_energy_confirmed_staged_review_rollback_choices:
              confirmedRollbackReviewChoices &&
              confirmedRollbackReviewChoices.length > 0
                ? confirmedRollbackReviewChoices
                : undefined,
          }
        : {}),
    },
    options: draftState
      ? {
          stationary_energy_draft_run_id: draftState.draft_run_id,
          stationary_energy_pending_decision_review_count:
            decisionReviewContext.length,
          stationary_energy_ui_surfaces: ["chat_text", "decision_review_card"],
        }
      : {
          stationary_energy_interaction_mode: "free_text",
          stationary_energy_ui_surfaces: ["chat_text"],
        },
  };
}

export function resolveInventorySaveConfirmationRequest(params: {
  canSaveToInventory: boolean;
  toolSuccess: boolean;
  toolMessage?: string | null;
  blockedMessage: string;
}): {
  message: string | null;
  showConfirmation: boolean;
} {
  const { canSaveToInventory, toolSuccess, toolMessage, blockedMessage } =
    params;

  if (toolSuccess && canSaveToInventory) {
    return {
      message: toolMessage ?? null,
      showConfirmation: true,
    };
  }

  return {
    message: canSaveToInventory
      ? (toolMessage ?? blockedMessage)
      : blockedMessage,
    showConfirmation: false,
  };
}
