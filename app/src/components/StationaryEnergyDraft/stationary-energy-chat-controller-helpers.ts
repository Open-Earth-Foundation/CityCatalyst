import {
  createDecisionReviewMessage,
  type ChatMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import type {
  DecisionReviewContext,
} from "@/components/StationaryEnergyDraft/flow";
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

export function buildSourcePreferenceReply(preference: string): string {
  if (preference === "No preference") {
    return "Got it. I will keep the current source ranking.";
  }

  return `Got it. I will use ${preference.replace("Prefer ", "")} where it fits the reviewed source options.`;
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
  const { cityId, content, decisionReviewContext, draftState, inventoryId, threadId } =
    params;

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
          stationary_energy_ui_surfaces: [
            "chat_text",
            "decision_review_card",
          ],
        }
      : {},
  };
}
