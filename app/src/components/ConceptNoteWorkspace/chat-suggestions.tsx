"use client";

import { useEffect, useRef, useState } from "react";
import { Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { ReviewButton as Button } from "./review-button";

interface Props {
  runId: string;
  threadId: string;
  lng: string;
  tab: "draft" | "structure" | "context";
  revision: string;
  lastMessageId?: string;
  hasDocument: boolean;
  onSelect: (question: string) => void;
}

/** Optional next questions; stale requests never replace the current workspace's choices. */
export function ChatSuggestions({
  runId,
  threadId,
  lng,
  tab,
  revision,
  lastMessageId,
  hasDocument,
  onSelect,
}: Props) {
  const { t } = useTranslation(lng, "concept-notes");
  const key = JSON.stringify([
    runId,
    threadId,
    lng,
    tab,
    revision,
    lastMessageId,
  ]);
  const cache = useRef(new Map<string, string[]>());
  const [result, setResult] = useState<{
    key: string;
    suggestions: string[];
  } | null>(null);

  useEffect(() => {
    const cached = cache.current.get(key);
    if (cached) {
      setResult({ key, suggestions: cached });
      return;
    }
    const controller = new AbortController();
    // Debounce workspace changes and StrictMode's initial effect replay.
    const timer = window.setTimeout(async () => {
      let suggestions: string[] = [];
      try {
        const response = await fetch(
          `/api/v1/concept-notes/${runId}/chat/suggestions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: lng, tab }),
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Suggestions unavailable");
        const payload = await response.json();
        if (
          Array.isArray(payload.suggestions) &&
          payload.suggestions.length === 2 &&
          payload.suggestions.every(
            (value: unknown) =>
              typeof value === "string" &&
              value.trim().length > 0 &&
              value.length <= 80,
          ) &&
          payload.suggestions[0].trim().toLowerCase() !==
            payload.suggestions[1].trim().toLowerCase()
        )
          suggestions = payload.suggestions;
      } catch {
        // Keep translated fallback questions available even when the service is down.
      }
      if (controller.signal.aborted) return;
      if (cache.current.size >= 8) cache.current.clear();
      cache.current.set(key, suggestions);
      setResult({ key, suggestions });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, runId, lng, tab]);

  const generated = result?.key === key ? result.suggestions : [];
  const questions =
    generated.length === 2
      ? generated
      : [
          t(hasDocument ? "chat-suggestion-review" : "chat-suggestion-start"),
          t(hasDocument ? "chat-suggestion-gaps" : "chat-suggestion-evidence"),
        ];
  return (
    <VStack align="stretch" gap={2} data-testid="concept-note-chat-suggestions">
      <Text fontSize="label.sm" color="content.secondary">
        {t("chat-suggestions-title")}
      </Text>
      {questions.map((question) => (
        <Button
          key={question}
          type="button"
          variant="outline"
          size="sm"
          whiteSpace="normal"
          height="auto"
          minH="44px"
          py={2}
          textAlign="left"
          justifyContent="flex-start"
          onClick={() => onSelect(question)}
        >
          {question}
        </Button>
      ))}
    </VStack>
  );
}
