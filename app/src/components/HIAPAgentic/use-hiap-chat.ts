"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { useSSEStream } from "@/hooks/useSSEStream";
import {
  appendMessage,
  appendToLastMessage,
  type Message,
  removeLastEmptyAssistantMessage,
} from "@/utils/chatUtils";

export type HiapRerankDecisionMessage = {
  kind: "hiap_rerank_decision";
  id: string;
  role: "assistant";
  text: string;
  actionName: string;
  actionType: "mitigation" | "adaptation";
  previousRank: number;
  newRank: number;
};

export type HiapChatMessage = Message | HiapRerankDecisionMessage;

type UseHiapChatParams = {
  cityId: string;
  inventoryId: string;
  lng: string;
  onHiapContextChanged?: () => void;
};

type HiapToolResult = {
  name?: string;
  success?: boolean;
  ui_event?: string;
  tool_call_id?: string;
  actionId?: string;
  actionName?: string;
  actionType?: "mitigation" | "adaptation";
  previousRank?: number;
  newRank?: number;
};

function isHiapRerankToolResult(
  tool: HiapToolResult,
): tool is HiapToolResult & {
  actionName: string;
  actionType: "mitigation" | "adaptation";
  previousRank: number;
  newRank: number;
} {
  return (
    tool.success === true &&
    (tool.name === "hiap_rerank_action" ||
      tool.ui_event === "hiap_rerank_action_applied") &&
    typeof tool.actionName === "string" &&
    (tool.actionType === "mitigation" || tool.actionType === "adaptation") &&
    typeof tool.previousRank === "number" &&
    typeof tool.newRank === "number"
  );
}

export function useHiapChat({
  cityId,
  inventoryId,
  lng,
  onHiapContextChanged,
}: UseHiapChatParams) {
  const threadIdRef = useRef("");
  const assistantStartedRef = useRef(false);
  const [messages, setMessages] = useState<HiapChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [assistantStartedResponding, setAssistantStartedResponding] =
    useState(false);

  const context = {
    module: "hiap",
    city_id: cityId,
    inventory_id: inventoryId,
    lng,
  };

  const { startStream, stopStream } = useSSEStream({
    onMessage: (content: string) => {
      assistantStartedRef.current = true;
      setAssistantStartedResponding(true);
      setMessages((prev) => appendToLastMessage(prev, content));
    },
    onToolResult: (tool: HiapToolResult) => {
      if (!isHiapRerankToolResult(tool)) {
        return;
      }

      const id = [
        "hiap-rerank",
        tool.tool_call_id ?? tool.actionId ?? tool.actionName,
        tool.previousRank,
        tool.newRank,
      ].join("-");

      setMessages((prev) => {
        if (prev.some((message) => "id" in message && message.id === id)) {
          return prev;
        }

        return [
          ...prev,
          {
            kind: "hiap_rerank_decision",
            id,
            role: "assistant",
            text: "",
            actionName: tool.actionName,
            actionType: tool.actionType,
            previousRank: tool.previousRank,
            newRank: tool.newRank,
          },
        ];
      });
      onHiapContextChanged?.();
    },
    onComplete: () => {
      onHiapContextChanged?.();
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
      assistantStartedRef.current = false;
    },
    onError: () => {
      if (!assistantStartedRef.current) {
        setMessages((prev) => removeLastEmptyAssistantMessage(prev));
      }
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
      assistantStartedRef.current = false;
    },
  });

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text: "I can help review this city's high-impact climate actions, compare options, research implementation examples, and prepare action plans.",
      },
    ]);
  }, [cityId, inventoryId]);

  const initializeThread = async () => {
    if (threadIdRef.current) {
      return threadIdRef.current;
    }

    const response = await fetch("/api/v1/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventory_id: inventoryId,
        title: "HIAP chat",
        context,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to initialize HIAP chat thread");
    }

    const data = await response.json();
    threadIdRef.current = data.threadId;
    return threadIdRef.current;
  };

  const sendMessage = async (message: string) => {
    const threadId = await initializeThread();
    await startStream("/api/v1/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId,
        content: message,
        inventory_id: inventoryId,
        context,
        options: {
          module: "hiap",
        },
      }),
    });
  };

  const submitChat = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || inputDisabled) {
      return;
    }

    setMessages((prev) => appendMessage(prev, "user", message));
    setMessages((prev) => appendMessage(prev, "assistant", ""));
    setChatInput("");
    setInputDisabled(true);
    setIsGenerating(true);
    setAssistantStartedResponding(false);
    assistantStartedRef.current = false;

    try {
      await sendMessage(message);
    } catch {
      setMessages((prev) => removeLastEmptyAssistantMessage(prev));
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
      assistantStartedRef.current = false;
    }
  };

  const askSuggestion = async (message: string) => {
    if (inputDisabled) {
      return;
    }
    setChatInput(message);
    setMessages((prev) => appendMessage(prev, "user", message));
    setMessages((prev) => appendMessage(prev, "assistant", ""));
    setInputDisabled(true);
    setIsGenerating(true);
    setAssistantStartedResponding(false);
    assistantStartedRef.current = false;

    try {
      await sendMessage(message);
      setChatInput("");
    } catch {
      setMessages((prev) => removeLastEmptyAssistantMessage(prev));
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
      assistantStartedRef.current = false;
    }
  };

  return {
    messages,
    chatInput,
    setChatInput,
    inputDisabled,
    isGenerating,
    assistantStartedResponding,
    submitChat,
    askSuggestion,
    stopChat: stopStream,
  };
}
