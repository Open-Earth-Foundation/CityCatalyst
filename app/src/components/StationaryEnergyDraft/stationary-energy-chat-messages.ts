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

export type ChatMessage = ChatTextMessage | ChatDecisionReviewMessage;

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
