"use client";

import { useEffect, useRef, useState } from "react";

import {
  STREAM_STALLED_CODE,
  useSSEStream,
  type SSEErrorDetails,
} from "@/hooks/useSSEStream";
import { useTranslation } from "@/i18n/client";
import type { EditScope } from "@/util/concept-note-edit-types";
import {
  readConceptNoteProgress,
  readConceptNoteReasoning,
  type ConceptNoteProgress,
  type ConceptNoteReasoning,
  type ConceptNoteChatMessage,
  readConceptNoteThreadMessages,
  readConceptNoteToolVisual,
  readConceptNoteChoiceAction,
  readConceptNoteChoices,
} from "./chat-utils";

// The service replaces this content with its own hidden overview trigger.
const DRAFT_OVERVIEW_CONTENT = "draft_overview";
const DRAFT_OVERVIEW_UNAVAILABLE = "concept_note_draft_overview_unavailable";
const CONTEXT_NOT_READY = "concept_note_context_not_ready";
const QUESTION_STALE = "concept_note_question_stale";
// Another tab or session made a different chat the run's active chat.
const THREAD_INACTIVE = "concept_note_thread_mismatch";
const HTTP_REQUEST_ERROR_KEYS: Record<number, string> = {
  401: "chat-auth-required",
  403: "chat-access-denied",
  404: "chat-not-found",
};
// Climate Advisor sends a heartbeat every 15 s, so 45 s of silence means the
// connection or the service is gone rather than the model being slow.
const CHAT_IDLE_TIMEOUT_MS = 45_000;

export type ChatConnectionState =
  "connecting" | "connected" | "retrying" | "error";

interface ChatTurn {
  content: string;
  context: Record<string, unknown>;
  options?: Record<string, unknown>;
  overview: boolean;
  completed?: boolean;
  /** A saved message whose reply never arrived, found when history loaded. */
  resumed?: boolean;
}

function chatErrorKey(
  code: string | undefined,
  details: SSEErrorDetails | undefined,
  turn: ChatTurn | null,
): string {
  if (code === STREAM_STALLED_CODE) return "chat-stream-stalled";
  // No response, or a gateway error, before any stream: the service is down.
  if (
    details &&
    !details.streamStarted &&
    (details.status === undefined || details.status >= 500)
  ) {
    return "chat-service-unavailable";
  }
  return turn?.overview ? "chat-overview-error" : "chat-send-error";
}

interface UseConceptNoteChatOptions {
  lng: string;
  runId: string;
  threadId: string | null;
  editScope?: EditScope;
  onProposal?: (proposalId: string) => Promise<void>;
  onDraftOverviewComplete?: () => void;
  /** Called when the service rejects a send because this chat is no longer active. */
  onThreadInactive?: () => void;
}

interface ConceptNoteChatController {
  connection: ChatConnectionState;
  error: string | null;
  /** True when the visible error can be recovered with `retry`. */
  canRetry: boolean;
  /** The drafting overview failed and has not been posted yet. */
  overviewFailed: boolean;
  historyLoading: boolean;
  isGenerating: boolean;
  progress: ConceptNoteProgress | null;
  reasoning: ConceptNoteReasoning[];
  messages: ConceptNoteChatMessage[];
  sendMessage: (
    content: string,
    scope?: EditScope,
    questionMessageId?: string,
  ) => Promise<boolean>;
  requestDraftOverview: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useConceptNoteChat({
  lng,
  runId,
  threadId,
  editScope,
  onProposal,
  onDraftOverviewComplete,
  onThreadInactive,
}: UseConceptNoteChatOptions): ConceptNoteChatController {
  const { t } = useTranslation(lng, "concept-notes");
  const [messages, setMessages] = useState<ConceptNoteChatMessage[]>([]);
  const [messagesThreadId, setMessagesThreadId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reasoning, setReasoning] = useState<ConceptNoteReasoning[]>([]);
  const [progress, setProgress] = useState<ConceptNoteProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Transport, server and stream failures mark the connection as failed.
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [failedTurn, setFailedTurn] = useState<ChatTurn | null>(null);
  // The latest saved message has no reply, for example after a reload mid-turn.
  const [replyMissing, setReplyMissing] = useState(false);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const staleQuestionThreadRef = useRef<string | null>(null);
  const currentTurnRef = useRef<ChatTurn | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);
  // Partial text of a failed reply; it was never saved, so Retry replaces it.
  const failedAssistantMessageIdRef = useRef<string | null>(null);
  // The overview turn keeps its own label instead of the request-based stages.
  const draftOverviewTurnRef = useRef(false);

  const { startStream, stopStream } = useSSEStream({
    forceEventStream: true,
    idleTimeoutMs: CHAT_IDLE_TIMEOUT_MS,
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
      if (
        assistantMessageIdRef.current &&
        update &&
        !draftOverviewTurnRef.current
      ) {
        setProgress(update);
      }
    },
    onToolResult: (result) => {
      const choices = readConceptNoteChoices(result);
      const assistantId = assistantMessageIdRef.current;
      if (choices && assistantId) {
        const choiceAction = readConceptNoteChoiceAction(result.on_answer);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, choices, choiceAction }
              : message,
          ),
        );
      }
      const data = result.data;
      const visual = readConceptNoteToolVisual(result);
      // The done event runs tool results before onComplete, so the turn's id is still set.
      const visualMessageId = assistantMessageIdRef.current;
      if (visual && visualMessageId) {
        // Identity check keeps a re-reported tool call from rendering twice.
        setMessages((current) =>
          current.map((message) =>
            message.id === visualMessageId &&
            !message.visuals?.some(
              (item) =>
                item.html === visual.html && item.title === visual.title,
            )
              ? { ...message, visuals: [...(message.visuals ?? []), visual] }
              : message,
          ),
        );
      }
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
      if (!draftOverviewTurnRef.current) {
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
    onComplete: (data) => {
      if (currentTurnRef.current) currentTurnRef.current.completed = true;
      const assistantId = assistantMessageIdRef.current;
      if (assistantId && data) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  questionMessageId:
                    data.history_saved === true &&
                    typeof data.assistant_message_id === "string"
                      ? data.assistant_message_id
                      : undefined,
                  ...(data.history_saved === false
                    ? { choices: undefined }
                    : {}),
                }
              : message,
          ),
        );
      }
      // Draft observation ends at chapter completion; refresh the consumed overview.
      if (draftOverviewTurnRef.current) {
        onDraftOverviewComplete?.();
        setOverviewFailed(false);
      }
      draftOverviewTurnRef.current = false;
      currentTurnRef.current = null;
      setConnectionFailed(false);
      setRetrying(false);
      setFailedTurn(null);
      setReasoning([]);
      assistantMessageIdRef.current = null;
      pendingUserMessageIdRef.current = null;
      setIsGenerating(false);
    },
    onError: (_message, code, details) => {
      if (draftOverviewTurnRef.current && code === DRAFT_OVERVIEW_UNAVAILABLE) {
        onDraftOverviewComplete?.();
      }
      draftOverviewTurnRef.current = false;
      const turn = currentTurnRef.current;
      currentTurnRef.current = null;
      setRetrying(false);
      setReasoning([]);
      const assistantMessageId = assistantMessageIdRef.current;
      const status = details?.status;
      // Timeouts and rate limits may still have accepted the user's answer.
      const requestRejected =
        !details?.streamStarted &&
        status !== undefined &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429;
      const rejectedUserMessageId =
        code === CONTEXT_NOT_READY || requestRejected
          ? pendingUserMessageIdRef.current
          : null;
      // No response at all: the request most likely never reached Clima, so
      // the answer is marked as not sent and its card can be answered again.
      const unsentUserMessageId =
        code !== STREAM_STALLED_CODE &&
        details !== undefined &&
        !details.streamStarted &&
        status === undefined
          ? pendingUserMessageIdRef.current
          : null;
      if (assistantMessageId) {
        setMessages((current) =>
          current
            .filter(
              (message) =>
                message.id !== rejectedUserMessageId &&
                (message.id !== assistantMessageId ||
                  Boolean(message.text.trim() || message.visuals?.length)),
            )
            // Failed assistant output is not saved, so its choices cannot be answered.
            .map((message) =>
              message.id === assistantMessageId
                ? { ...message, choices: undefined }
                : message.id === unsentUserMessageId
                  ? { ...message, unsent: true }
                  : message,
            ),
        );
      }
      assistantMessageIdRef.current = null;
      pendingUserMessageIdRef.current = null;
      setIsGenerating(false);
      if (code === QUESTION_STALE && requestRejected) {
        staleQuestionThreadRef.current = threadId;
        setMessagesThreadId(null);
        setConnectionFailed(false);
        setFailedTurn(null);
        setError(t("chat-question-stale"));
        setHistoryAttempt((attempt) => attempt + 1);
        return;
      }
      // Nothing was saved; the chat list shows which chat is active now.
      if (code === THREAD_INACTIVE && requestRejected) {
        setConnectionFailed(false);
        setFailedTurn(null);
        setError(t("chat-thread-inactive"));
        onThreadInactive?.();
        return;
      }
      // Clima answered and declined; the connection itself is fine.
      if (code === DRAFT_OVERVIEW_UNAVAILABLE || code === CONTEXT_NOT_READY) {
        setConnectionFailed(false);
        setFailedTurn(null);
        if (code === DRAFT_OVERVIEW_UNAVAILABLE) {
          // Another tab or an earlier visit already posted this overview.
          setOverviewFailed(false);
        } else {
          setError(t("chat-context-not-ready"));
        }
        return;
      }
      // Request rejections need user action, not a connection retry. Timeouts
      // and rate limits remain retryable because they can be transient.
      if (requestRejected) {
        setConnectionFailed(false);
        setFailedTurn(null);
        if (turn?.overview) setOverviewFailed(true);
        setError(t(HTTP_REQUEST_ERROR_KEYS[status] ?? "chat-request-rejected"));
        return;
      }
      setConnectionFailed(true);
      setFailedTurn(turn);
      failedAssistantMessageIdRef.current = assistantMessageId;
      if (turn?.overview) setOverviewFailed(true);
      setError(t(chatErrorKey(code, details, turn)));
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
        if (controller.signal.aborted) return;
        failedAssistantMessageIdRef.current = null;
        const loaded = readConceptNoteThreadMessages(payload);
        setMessages(loaded);
        setMessagesThreadId(threadId);
        // A turn that stopped before Clima replied leaves the user's message last.
        const unanswered = loaded.at(-1);
        const card = loaded.at(-2);
        const missing =
          unanswered?.role === "user" &&
          staleQuestionThreadRef.current !== threadId;
        setReplyMissing(missing);
        setError(
          staleQuestionThreadRef.current === threadId
            ? t("chat-question-stale")
            : missing
              ? t("chat-reply-missing")
              : null,
        );
        setConnectionFailed(false);
        setFailedTurn(
          missing && unanswered
            ? {
                content: unanswered.text,
                context:
                  card?.choices && card.questionMessageId
                    ? {
                        concept_note_question_message_id:
                          card.questionMessageId,
                      }
                    : {},
                overview: false,
                resumed: true,
              }
            : null,
        );
        setRetrying(false);
      } catch (requestError) {
        if (
          !(requestError instanceof Error) ||
          requestError.name !== "AbortError"
        ) {
          setReplyMissing(false);
          setMessages([]);
          setMessagesThreadId(threadId);
          setError(t("chat-history-error"));
          setConnectionFailed(true);
          setFailedTurn(null);
          setRetrying(false);
        }
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [t, threadId, historyAttempt]);

  useEffect(() => stopStream, [stopStream]);

  async function sendMessage(
    content: string,
    scope = editScope,
    questionMessageId?: string,
  ): Promise<boolean> {
    const normalizedContent = content.trim();
    if (
      !normalizedContent ||
      !threadId ||
      isGenerating ||
      currentTurnRef.current
    ) {
      return false;
    }

    const userMessageId = crypto.randomUUID();
    pendingUserMessageIdRef.current = userMessageId;
    return streamReply(
      {
        content: normalizedContent,
        context: {
          ...(scope
            ? {
                concept_note_edit: {
                  scope,
                  idempotency_key: crypto.randomUUID(),
                },
              }
            : {}),
          ...(questionMessageId
            ? { concept_note_question_message_id: questionMessageId }
            : {}),
        },
        overview: false,
      },
      { id: userMessageId, role: "user", text: normalizedContent },
    );
  }

  // Starts the hidden first turn that summarises a finished drafting pass.
  async function requestDraftOverview(): Promise<void> {
    if (!threadId || isGenerating || currentTurnRef.current) {
      return;
    }
    draftOverviewTurnRef.current = true;
    await streamReply({
      content: DRAFT_OVERVIEW_CONTENT,
      context: {},
      options: { concept_note_turn: "draft_overview" },
      overview: true,
    });
  }

  // Repeats whatever failed: the history load, the overview, or the last turn.
  async function retry(): Promise<void> {
    if (
      !threadId ||
      isGenerating ||
      retrying ||
      (!connectionFailed && !replyMissing)
    ) {
      return;
    }
    if (!failedTurn) {
      setRetrying(true);
      setHistoryAttempt((attempt) => attempt + 1);
      return;
    }
    if (failedTurn.overview) {
      await requestDraftOverview();
      return;
    }
    // The question is already on screen, and the service skips saving it again
    // when it is still the latest stored message.
    await streamReply({
      ...failedTurn,
      context:
        failedTurn.resumed && editScope
          ? {
              ...failedTurn.context,
              concept_note_edit: {
                scope: editScope,
                idempotency_key: crypto.randomUUID(),
              },
            }
          : failedTurn.context,
      options: { ...failedTurn.options, concept_note_turn: "retry" },
    });
  }

  async function streamReply(
    turn: ChatTurn,
    userMessage?: ConceptNoteChatMessage,
  ): Promise<boolean> {
    const { content, context, options } = turn;
    currentTurnRef.current = turn;
    turn.completed = false;
    staleQuestionThreadRef.current = null;
    setReplyMissing(false);
    // Anything sent after a failure is the attempt to reconnect.
    if (connectionFailed) setRetrying(true);
    // The failed reply was never saved; drop its partial text so it is not shown twice.
    const failedAssistantId = failedAssistantMessageIdRef.current;
    failedAssistantMessageIdRef.current = null;
    const assistantMessageId = crypto.randomUUID();
    assistantMessageIdRef.current = assistantMessageId;
    setMessages((current) => [
      ...current
        .filter((message) => message.id !== failedAssistantId)
        // A new message replaces an unsent one; Retry sends the unsent one.
        .filter((message) => !(userMessage && message.unsent))
        .map((message) =>
          message.unsent ? { ...message, unsent: false } : message,
        ),
      ...(userMessage ? [userMessage] : []),
      { id: assistantMessageId, role: "assistant", text: "" },
    ]);
    setError(null);
    setIsGenerating(true);
    setReasoning([]);
    setProgress({
      stage: draftOverviewTurnRef.current ? "summarizing_draft" : "preparing",
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
        draftOverviewTurnRef.current = false;
        currentTurnRef.current = null;
        setRetrying(false);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, choices: undefined }
              : message,
          ),
        );
        assistantMessageIdRef.current = null;
        pendingUserMessageIdRef.current = null;
        setIsGenerating(false);
        setReasoning([]);
      }
    }
    return Boolean(turn.completed);
  }

  const historyLoading = Boolean(threadId) && messagesThreadId !== threadId;
  const visibleError = messagesThreadId === threadId ? error : null;
  const connection: ChatConnectionState = retrying
    ? "retrying"
    : !threadId || historyLoading
      ? "connecting"
      : connectionFailed
        ? "error"
        : "connected";

  return {
    connection,
    error: visibleError,
    canRetry:
      (connection === "error" || (replyMissing && Boolean(failedTurn))) &&
      Boolean(visibleError) &&
      !isGenerating,
    overviewFailed,
    historyLoading,
    isGenerating,
    progress,
    reasoning,
    messages: messagesThreadId === threadId ? messages : [],
    sendMessage,
    requestDraftOverview,
    retry,
  };
}
