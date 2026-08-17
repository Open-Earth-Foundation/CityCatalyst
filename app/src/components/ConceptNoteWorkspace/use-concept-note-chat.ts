"use client";

import { useEffect, useRef, useState } from "react";

import { useSSEStream } from "@/hooks/useSSEStream";
import { useTranslation } from "@/i18n/client";

import {
  type ConceptNoteChatMessage,
  readConceptNoteThreadMessages,
} from "./chat-utils";

interface UseConceptNoteChatOptions {
  lng: string;
  threadId: string | null;
}

interface ConceptNoteChatController {
  error: string | null;
  historyLoading: boolean;
  isGenerating: boolean;
  messages: ConceptNoteChatMessage[];
  sendMessage: (content: string) => Promise<void>;
}

export function useConceptNoteChat({
  lng,
  threadId,
}: UseConceptNoteChatOptions): ConceptNoteChatController {
  const { t } = useTranslation(lng, "concept-notes");
  const [messages, setMessages] = useState<ConceptNoteChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(Boolean(threadId));
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);

  const { startStream, stopStream } = useSSEStream({
    forceEventStream: true,
    onMessage: (content) => {
      const assistantMessageId = assistantMessageIdRef.current;
      if (!assistantMessageId) {
        return;
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
      assistantMessageIdRef.current = null;
      setIsGenerating(false);
    },
    onError: () => {
      const assistantMessageId = assistantMessageIdRef.current;
      if (assistantMessageId) {
        setMessages((current) =>
          current.filter(
            (message) =>
              message.id !== assistantMessageId || Boolean(message.text.trim()),
          ),
        );
      }
      assistantMessageIdRef.current = null;
      setError(t("chat-send-error"));
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
      } catch (requestError) {
        if (
          !(requestError instanceof Error) ||
          requestError.name !== "AbortError"
        ) {
          setError(t("chat-history-error"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
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
    assistantMessageIdRef.current = assistantMessageId;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: normalizedContent },
      { id: assistantMessageId, role: "assistant", text: "" },
    ]);
    setError(null);
    setIsGenerating(true);

    try {
      await startStream("/api/v1/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, content: normalizedContent }),
      });
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === "AbortError") {
        assistantMessageIdRef.current = null;
        setIsGenerating(false);
      }
    }
  }

  return {
    error,
    historyLoading,
    isGenerating,
    messages,
    sendMessage,
  };
}
