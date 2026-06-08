import {
  createDecisionReviewMessage,
  type ChatMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import type { TFunction } from "i18next";
import type { DecisionReviewContext } from "@/components/StationaryEnergyDraft/flow";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftStatusResponse,
} from "@/components/StationaryEnergyDraft/types";

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

export function buildStationaryEnergyChatRequest(params: {
  cityId: string;
  content: string;
  decisionReviewContext: DecisionReviewContext[];
  draftState: DraftStatusResponse | null;
  inventoryId: string;
  threadId: string | null;
}): Record<string, unknown> {
  const {
    cityId,
    content,
    decisionReviewContext,
    draftState,
    inventoryId,
    threadId,
  } = params;

  return {
    threadId,
    content,
    inventory_id: inventoryId,
    context: draftState
      ? {
          stationary_energy_draft_run_id: draftState.draft_run_id,
          draft_run_id: draftState.draft_run_id,
          city_id: cityId,
          inventory_id: inventoryId,
          stationary_energy_interaction_mode: "free_text",
          stationary_energy_pending_decision_reviews: decisionReviewContext,
        }
      : undefined,
    options: draftState
      ? {
          stationary_energy_draft_run_id: draftState.draft_run_id,
          stationary_energy_pending_decision_review_count:
            decisionReviewContext.length,
          stationary_energy_ui_surfaces: ["chat_text", "decision_review_card"],
        }
      : {},
  };
}
