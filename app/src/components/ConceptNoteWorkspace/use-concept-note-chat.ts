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

interface UseConceptNoteChatOptions {
  lng: string;
  runId: string;
  threadId: string | null;
  editScope?: EditScope;
  onProposal?: (proposalId: string) => Promise<void>;
}

interface ConceptNoteChatController {
  error: string | null;
  historyLoading: boolean;
  isGenerating: boolean;
  progress: ConceptNoteProgress[];
  reasoning: ConceptNoteReasoning[];
  messages: ConceptNoteChatMessage[];
  sendMessage: (content: string) => Promise<void>;
}

export function useConceptNoteChat({
  lng,
  runId,
  threadId,
  editScope,
  onProposal,
}: UseConceptNoteChatOptions): ConceptNoteChatController {
  const { t } = useTranslation(lng, "concept-notes");
  const [messages, setMessages] = useState<ConceptNoteChatMessage[]>([]);
  const [messagesThreadId, setMessagesThreadId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reasoning, setReasoning] = useState<ConceptNoteReasoning[]>([]);
  const [progress, setProgress] = useState<ConceptNoteProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);

  const { startStream, stopStream } = useSSEStream({
    forceEventStream: true,
    onReasoning: (value) => {
      const update = readConceptNoteReasoning(value);
      const assistantId = assistantMessageIdRef.current;
      if (!assistantId || !update) return;
      setReasoning((current) =>
        current.some((item) => item.id === update.id)
          ? current.map((item) =>
              item.id === update.id
                ? { ...item, text: item.text + update.text }
                : item,
            )
          : [...current, update],
      );
    },
    onProgress: (value) => {
      const update = readConceptNoteProgress(value);
      if (assistantMessageIdRef.current && update) {
        setProgress((current) => {
          const previous = current.at(-1);
          if (
            previous?.stage === update.stage &&
            previous.chapterTitle === update.chapterTitle &&
            previous.completed === update.completed &&
            previous.total === update.total
          )
            return current;
          return [...current.slice(-3), update];
        });
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
      setProgress((current) =>
        current.at(-1)?.stage === "responding"
          ? current
          : [...current.slice(-3), { stage: "responding" }],
      );
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, text: message.text + content }
            : message,
        ),
      );
    },
    onComplete: () => {
      setReasoning([]);
      assistantMessageIdRef.current = null;
      pendingUserMessageIdRef.current = null;
      setIsGenerating(false);
    },
    onError: (_message, code) => {
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
      setError(
        t(
          code === "concept_note_context_not_ready"
            ? "chat-context-not-ready"
            : "chat-send-error",
        ),
      );
      setIsGenerating(false);
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

    const assistantMessageId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    assistantMessageIdRef.current = assistantMessageId;
    pendingUserMessageIdRef.current = userMessageId;
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: normalizedContent },
      { id: assistantMessageId, role: "assistant", text: "" },
    ]);
    setError(null);
    setIsGenerating(true);
    setReasoning([]);
    setProgress([{ stage: "preparing" }]);

    try {
      await startStream("/api/v1/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          content: normalizedContent,
          context: {
            concept_note_run_id: runId,
            ...(editScope
              ? {
                  concept_note_edit: {
                    scope: editScope,
                    idempotency_key: crypto.randomUUID(),
                  },
                }
              : {}),
          },
        }),
      });
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
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
  };
}
