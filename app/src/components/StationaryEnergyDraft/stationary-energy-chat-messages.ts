import type { DraftDecisionState } from "@/components/StationaryEnergyDraft/types";

export type ChatTextMessage = {
  id: string;
  kind: "text";
  role: "user" | "assistant";
  text: string;
};

export type ChatDecisionReviewMessage = {
  id: string;
  kind: "decision_review";
  proposalId: string;
};

export type ChatInventorySaveConfirmationMessage = {
  id: string;
  kind: "inventory_save_confirmation";
};

export type StationaryEnergyToolChoiceSummary = {
  proposal_id?: string | null;
  target_id?: string | null;
  candidate_id?: string | null;
  selected_candidate_id?: string | null;
  selected_source_id?: string | null;
  target_label?: string | null;
  source_label?: string | null;
  source_short_label?: string | null;
  source_meta?: string | null;
  value?: string | null;
  action?: string | null;
  notation_key?: string | null;
  unavailable_reason?: string | null;
  unavailable_explanation?: string | null;
  rationale?: string | null;
  reason?: string | null;
};

export type ChatBulkReviewConfirmationMessage = {
  id: string;
  kind: "stationary_energy_bulk_review_confirmation";
  message?: string | null;
  choices: StationaryEnergyToolChoiceSummary[];
  blockedChoices: StationaryEnergyToolChoiceSummary[];
};

export type ChatStagedReviewUpdateConfirmationMessage = {
  id: string;
  kind: "stationary_energy_staged_review_update_confirmation";
  mode: "change" | "rollback";
  message?: string | null;
  choices: StationaryEnergyToolChoiceSummary[];
  blockedChoices: StationaryEnergyToolChoiceSummary[];
};

export type ChatStationaryEnergyToolSummaryMessage = {
  id: string;
  kind: "stationary_energy_tool_summary";
  action: string;
  message?: string | null;
  selectedChoices: StationaryEnergyToolChoiceSummary[];
  blockedChoices: StationaryEnergyToolChoiceSummary[];
};

export type ChatMessage =
  | ChatTextMessage
  | ChatDecisionReviewMessage
  | ChatInventorySaveConfirmationMessage
  | ChatBulkReviewConfirmationMessage
  | ChatStagedReviewUpdateConfirmationMessage
  | ChatStationaryEnergyToolSummaryMessage;

export function createChatMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createTextMessage(
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

export function createDecisionReviewMessage(
  proposalId: string,
): ChatDecisionReviewMessage {
  return {
    id: `decision-review-${proposalId}`,
    kind: "decision_review",
    proposalId,
  };
}

export function createInventorySaveConfirmationMessage(): ChatInventorySaveConfirmationMessage {
  return {
    id: createChatMessageId("inventory-save-confirmation"),
    kind: "inventory_save_confirmation",
  };
}

export function createBulkReviewConfirmationMessage(params: {
  message?: string | null;
  choices: StationaryEnergyToolChoiceSummary[];
  blockedChoices?: StationaryEnergyToolChoiceSummary[];
}): ChatBulkReviewConfirmationMessage {
  return {
    id: createChatMessageId("stationary-energy-bulk-review-confirmation"),
    kind: "stationary_energy_bulk_review_confirmation",
    message: params.message,
    choices: params.choices,
    blockedChoices: params.blockedChoices ?? [],
  };
}

export function createStagedReviewUpdateConfirmationMessage(params: {
  mode: ChatStagedReviewUpdateConfirmationMessage["mode"];
  message?: string | null;
  choices: StationaryEnergyToolChoiceSummary[];
  blockedChoices?: StationaryEnergyToolChoiceSummary[];
}): ChatStagedReviewUpdateConfirmationMessage {
  return {
    id: createChatMessageId(
      "stationary-energy-staged-review-update-confirmation",
    ),
    kind: "stationary_energy_staged_review_update_confirmation",
    mode: params.mode,
    message: params.message,
    choices: params.choices,
    blockedChoices: params.blockedChoices ?? [],
  };
}

export function createStationaryEnergyToolSummaryMessage(params: {
  action: string;
  message?: string | null;
  selectedChoices?: StationaryEnergyToolChoiceSummary[];
  blockedChoices?: StationaryEnergyToolChoiceSummary[];
}): ChatStationaryEnergyToolSummaryMessage {
  return {
    id: createChatMessageId("stationary-energy-tool-summary"),
    kind: "stationary_energy_tool_summary",
    action: params.action,
    message: params.message,
    selectedChoices: params.selectedChoices ?? [],
    blockedChoices: params.blockedChoices ?? [],
  };
}

export function appendAssistantDeltaToMessages(
  current: ChatMessage[],
  delta: string,
): ChatMessage[] {
  const next = [...current];
  const last = next[next.length - 1];
  if (!last || last.kind !== "text" || last.role !== "assistant") {
    next.push(createTextMessage("assistant", delta));
  } else {
    next[next.length - 1] = { ...last, text: `${last.text}${delta}` };
  }
  return next;
}

export function removeEmptyAssistantTailFromMessages(
  current: ChatMessage[],
): ChatMessage[] {
  const last = current[current.length - 1];
  if (last?.kind === "text" && last.role === "assistant" && !last.text.trim()) {
    return current.slice(0, -1);
  }
  return current;
}
