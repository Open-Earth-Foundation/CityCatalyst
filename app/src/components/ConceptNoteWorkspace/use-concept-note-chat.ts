"use client";

import { useEffect, useRef, useState } from "react";

import { useSSEStream } from "@/hooks/useSSEStream";
import { useTranslation } from "@/i18n/client";
import type { EditScope } from "@/util/concept-note-edit-types";
import {
  readConceptNoteProgress,
  readConceptNoteReasoning,
  type ConceptNoteProgress,
  type ConceptNoteReasoning,
  type ConceptNoteChatMessage,
  readConceptNoteThreadMessages,
} from "./chat-utils";

// Hidden turns: the service replaces this content with its own trigger text
// and answers 409 with the code when nothing is waiting (another tab ran it).
type HiddenTurn = "draft_overview" | "source_review";
const HIDDEN_TURN_UNAVAILABLE: Record<HiddenTurn, string> = {
  draft_overview: "concept_note_draft_overview_unavailable",
  source_review: "concept_note_source_review_unavailable",
};
const HIDDEN_TURN_STAGE: Record<HiddenTurn, ConceptNoteProgress["stage"]> = {
  draft_overview: "summarizing_draft",
  source_review: "reviewing_sources",
};

interface UseConceptNoteChatOptions {
  lng: string;
  runId: string;
  threadId: string | null;
  editScope?: EditScope;
  onProposal?: (proposalId: string) => Promise<void>;
  onDraftOverviewComplete?: () => void;
  onSourceReviewComplete?: () => void;
}

interface ConceptNoteChatController {
  error: string | null;
  historyLoading: boolean;
  isGenerating: boolean;
  progress: ConceptNoteProgress | null;
  reasoning: ConceptNoteReasoning[];
  messages: ConceptNoteChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  requestDraftOverview: () => Promise<void>;
  requestSourceReview: () => Promise<void>;
}

export function useConceptNoteChat({
  lng,
  runId,
  threadId,
  editScope,
  onProposal,
  onDraftOverviewComplete,
  onSourceReviewComplete,
}: UseConceptNoteChatOptions): ConceptNoteChatController {
  const { t } = useTranslation(lng, "concept-notes");
  const [messages, setMessages] = useState<ConceptNoteChatMessage[]>([]);
  const [messagesThreadId, setMessagesThreadId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reasoning, setReasoning] = useState<ConceptNoteReasoning[]>([]);
  const [progress, setProgress] = useState<ConceptNoteProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);
  // Hidden turns keep their own label instead of the request-based stages.
  const hiddenTurnRef = useRef<HiddenTurn | null>(null);

  function completeHiddenTurn(turn: HiddenTurn | null): void {
    if (turn === "draft_overview") onDraftOverviewComplete?.();
    if (turn === "source_review") onSourceReviewComplete?.();
  }

  const { startStream, stopStream } = useSSEStream({
    forceEventStream: true,
    onReasoning: (value) => {
      const update = readConceptNoteReasoning(value);
      const assistantId = assistantMessageIdRef.current;
      if (!assistantId || !update) return;
      setReasoning((current) => {
        const previous = current.find((item) => item.id === update.id);
        return [
          ...current.filter((item) => item.id !== update.id),
          {
            ...update,
            text: update.replace
              ? update.text
              : (previous?.text || "") + update.text,
          },
        ];
      });
    },
    onProgress: (value) => {
      const update = readConceptNoteProgress(value);
      if (assistantMessageIdRef.current && update && !hiddenTurnRef.current) {
        setProgress(update);
      }
    },
    onToolResult: (result) => {
      const data = result.data;
      if (
        result.action === "concept_note.edit.propose" &&
        typeof result.success === "boolean" &&
        typeof data === "object" &&
        data !== null &&
        "proposal_id" in data &&
        typeof data.proposal_id === "string"
      ) {
        void onProposal?.(data.proposal_id);
      }
    },
    onMessage: (content) => {
      const assistantMessageId = assistantMessageIdRef.current;
      if (!assistantMessageId) {
        return;
      }
      if (!hiddenTurnRef.current) {
        setProgress((current) =>
          current?.stage === "responding" ? current : { stage: "responding" },
        );
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, text: message.text + content }
            : message,
        ),
      );
    },
    onComplete: () => {
      // Refresh the draft so the consumed overview or review stops pending.
      completeHiddenTurn(hiddenTurnRef.current);
      hiddenTurnRef.current = null;
      setReasoning([]);
      assistantMessageIdRef.current = null;
      pendingUserMessageIdRef.current = null;
      setIsGenerating(false);
    },
    onError: (_message, code) => {
      const hiddenTurn = hiddenTurnRef.current;
      const hiddenTurnUnavailable =
        hiddenTurn !== null && code === HIDDEN_TURN_UNAVAILABLE[hiddenTurn];
      if (hiddenTurnUnavailable) completeHiddenTurn(hiddenTurn);
      hiddenTurnRef.current = null;
      setReasoning([]);
      const assistantMessageId = assistantMessageIdRef.current;
      const rejectedUserMessageId =
        code === "concept_note_context_not_ready"
          ? pendingUserMessageIdRef.current
          : null;
      if (assistantMessageId) {
        setMessages((current) =>
          current.filter(
            (message) =>
              message.id !== rejectedUserMessageId &&
              (message.id !== assistantMessageId ||
                Boolean(message.text.trim())),
          ),
        );
      }
      assistantMessageIdRef.current = null;
      pendingUserMessageIdRef.current = null;
      setIsGenerating(false);
      // Another tab or an earlier visit already ran this hidden turn.
      if (hiddenTurnUnavailable) {
        return;
      }
      setError(
        t(
          code === "concept_note_context_not_ready"
            ? "chat-context-not-ready"
            : "chat-send-error",
        ),
      );
    },
  });

  useEffect(() => {
    if (!threadId) {
      return;
    }

    const controller = new AbortController();

    async function loadHistory(): Promise<void> {
      try {
        const response = await fetch(
          `/api/v1/chat/threads/${threadId}/messages`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error("Concept Note chat history request failed");
        }
        const payload: unknown = await response.json();
        setMessages(readConceptNoteThreadMessages(payload));
        setMessagesThreadId(threadId);
        setError(null);
      } catch (requestError) {
        if (
          !(requestError instanceof Error) ||
          requestError.name !== "AbortError"
        ) {
          setMessages([]);
          setMessagesThreadId(threadId);
          setError(t("chat-history-error"));
        }
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [t, threadId]);

  useEffect(() => stopStream, [stopStream]);

  async function sendMessage(content: string): Promise<void> {
    const normalizedContent = content.trim();
    if (!normalizedContent || !threadId || isGenerating) {
      return;
    }

    const userMessageId = crypto.randomUUID();
    pendingUserMessageIdRef.current = userMessageId;
    await streamReply({
      userMessage: { id: userMessageId, role: "user", text: normalizedContent },
      content: normalizedContent,
      context: editContext(),
    });
  }

  // Lets Clima propose reviewable edits within the current edit scope.
  function editContext(): Record<string, unknown> {
    return editScope
      ? {
          concept_note_edit: {
            scope: editScope,
            idempotency_key: crypto.randomUUID(),
          },
        }
      : {};
  }

  async function requestHiddenTurn(
    turn: HiddenTurn,
    context: Record<string, unknown>,
  ): Promise<void> {
    if (!threadId || isGenerating) {
      return;
    }
    hiddenTurnRef.current = turn;
    await streamReply({
      content: turn,
      context,
      options: { concept_note_turn: turn },
    });
  }

  // Starts the hidden first turn that summarises a finished drafting pass.
  async function requestDraftOverview(): Promise<void> {
    await requestHiddenTurn("draft_overview", {});
  }

  // Starts the hidden turn that checks newly added files against open gaps.
  async function requestSourceReview(): Promise<void> {
    await requestHiddenTurn("source_review", editContext());
  }

  async function streamReply({
    userMessage,
    content,
    context,
    options,
  }: {
    userMessage?: ConceptNoteChatMessage;
    content: string;
    context: Record<string, unknown>;
    options?: Record<string, unknown>;
  }): Promise<void> {
    const assistantMessageId = crypto.randomUUID();
    assistantMessageIdRef.current = assistantMessageId;
    setMessages((current) => [
      ...current,
      ...(userMessage ? [userMessage] : []),
      { id: assistantMessageId, role: "assistant", text: "" },
    ]);
    setError(null);
    setIsGenerating(true);
    setReasoning([]);
    setProgress({
      stage: hiddenTurnRef.current
        ? HIDDEN_TURN_STAGE[hiddenTurnRef.current]
        : "preparing",
    });

    try {
      await startStream("/api/v1/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          content,
          context: {
            concept_note_run_id: runId,
            // Lets Clima's help quote control labels in the visible UI language.
            ui_locale: lng,
            ...context,
          },
          ...(options ? { options } : {}),
        }),
      });
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
        hiddenTurnRef.current = null;
        assistantMessageIdRef.current = null;
        setIsGenerating(false);
        setReasoning([]);
      }
    }
  }

  return {
    error: messagesThreadId === threadId ? error : null,
    historyLoading: Boolean(threadId) && messagesThreadId !== threadId,
    isGenerating,
    progress,
    reasoning,
    messages: messagesThreadId === threadId ? messages : [],
    sendMessage,
    requestDraftOverview,
    requestSourceReview,
  };
}
