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
} from "./chat-utils";

// The service replaces this content with its own hidden overview trigger.
const DRAFT_OVERVIEW_CONTENT = "draft_overview";
const DRAFT_OVERVIEW_UNAVAILABLE = "concept_note_draft_overview_unavailable";
const CONTEXT_NOT_READY = "concept_note_context_not_ready";
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
  sendMessage: (content: string) => Promise<void>;
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
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const currentTurnRef = useRef<ChatTurn | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);
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
    onComplete: () => {
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
      const rejectedUserMessageId =
        code === CONTEXT_NOT_READY ? pendingUserMessageIdRef.current : null;
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
      const status = details?.status;
      if (
        !details?.streamStarted &&
        status !== undefined &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429
      ) {
        setConnectionFailed(false);
        setFailedTurn(null);
        if (turn?.overview) setOverviewFailed(true);
        setError(t(HTTP_REQUEST_ERROR_KEYS[status] ?? "chat-request-rejected"));
        return;
      }
      setConnectionFailed(true);
      setFailedTurn(turn);
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
        setMessages(readConceptNoteThreadMessages(payload));
        setMessagesThreadId(threadId);
        setError(null);
        setConnectionFailed(false);
        setFailedTurn(null);
        setRetrying(false);
      } catch (requestError) {
        if (
          !(requestError instanceof Error) ||
          requestError.name !== "AbortError"
        ) {
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

  async function sendMessage(content: string): Promise<void> {
    const normalizedContent = content.trim();
    if (!normalizedContent || !threadId || isGenerating) {
      return;
    }

    const userMessageId = crypto.randomUUID();
    pendingUserMessageIdRef.current = userMessageId;
    await streamReply(
      {
        content: normalizedContent,
        context: editScope
          ? {
              concept_note_edit: {
                scope: editScope,
                idempotency_key: crypto.randomUUID(),
              },
            }
          : {},
        overview: false,
      },
      { id: userMessageId, role: "user", text: normalizedContent },
    );
  }

  // Starts the hidden first turn that summarises a finished drafting pass.
  async function requestDraftOverview(): Promise<void> {
    if (!threadId || isGenerating) {
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
    if (!threadId || isGenerating || retrying || !connectionFailed) {
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
      options: { ...failedTurn.options, concept_note_turn: "retry" },
    });
  }

  async function streamReply(
    turn: ChatTurn,
    userMessage?: ConceptNoteChatMessage,
  ): Promise<void> {
    const { content, context, options } = turn;
    currentTurnRef.current = turn;
    // Anything sent after a failure is the attempt to reconnect.
    if (connectionFailed) setRetrying(true);
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
        assistantMessageIdRef.current = null;
        setIsGenerating(false);
        setReasoning([]);
      }
    }
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
    canRetry: connection === "error" && Boolean(visibleError) && !isGenerating,
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
