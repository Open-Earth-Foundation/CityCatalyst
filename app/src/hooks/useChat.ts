import { useState, useRef, useEffect } from "react";
import { useCreateChatThreadMutation } from "@/services/api";
import { UseErrorToast } from "@/hooks/Toasts";
import { useSSEStream } from "@/hooks/useSSEStream";
import { ChatService } from "@/services/chatService";
import {
  Message,
  appendMessage,
  appendToLastMessage,
  createInitialMessage,
  removeLastEmptyAssistantMessage,
} from "@/utils/chatUtils";
import { TFunction } from "i18next";
import { trackEvent } from "@/lib/analytics";

interface UseChatProps {
  inventoryId?: string;
  t: TFunction;
}

/**
 * Clima chat hook — Climate Advisor only (no OpenAI Assistants fallback).
 */
export function useChat({ inventoryId, t }: UseChatProps) {
  const threadIdRef = useRef("");
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [assistantStartedResponding, setAssistantStartedResponding] =
    useState(false);

  const [createChatThread] = useCreateChatThreadMutation();

  const handleError = (_error: unknown, errorMessage: string) => {
    const { showErrorToast } = UseErrorToast({
      title: t("an-error-occurred"),
      description: errorMessage,
    });
    showErrorToast();
  };

  const chatService = new ChatService({
    inventoryId,
    onError: handleError,
  });

  const { startStream, stopStream } = useSSEStream({
    onMessage: (content: string) => {
      setAssistantStartedResponding(true);
      setMessages((prev) => appendToLastMessage(prev, content));
    },
    onComplete: () => {
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
    },
    onError: (error: string) => {
      if (!assistantStartedResponding) {
        setMessages((prev) => removeLastEmptyAssistantMessage(prev));
      }
      handleError(
        new Error(error),
        "Failed to send message. Please try again.",
      );
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
    },
    onWarning: (warning: string) => {
      console.warn("Chat warning:", warning);
    },
  });

  const initializeThread = async () => {
    if (!threadIdRef.current) {
      const threadId = await chatService.initializeThread(async (data) => {
        const result = await createChatThread(data).unwrap();
        return { threadId: result.threadId };
      }, t);
      threadIdRef.current = threadId;
    }
  };

  const sendMessage = async (text: string) => {
    setAssistantStartedResponding(false);

    try {
      await initializeThread();

      trackEvent("chat_message_sent", {
        inventory_id: inventoryId,
      });

      await startStream(`/api/v1/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadIdRef.current,
          content: text,
        }),
      });
    } catch (error: unknown) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        if (!assistantStartedResponding) {
          setMessages((prev) => removeLastEmptyAssistantMessage(prev));
        }
        handleError(error, "Failed to send message. Please try again.");
      }
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    sendMessage(userInput);
    setMessages((prev) => appendMessage(prev, "user", userInput));
    setMessages((prev) => appendMessage(prev, "assistant", ""));
    setUserInput("");
    setInputDisabled(true);
    setIsGenerating(true);
  };

  const handleSuggestionClick = (message: string) => {
    sendMessage(message);
    setMessages((prev) => appendMessage(prev, "user", message));
    setMessages((prev) => appendMessage(prev, "assistant", ""));
    setInputDisabled(true);
    setIsGenerating(true);
  };

  const stopGeneration = () => {
    stopStream();
    setIsGenerating(false);
    setInputDisabled(false);
    setAssistantStartedResponding(false);
  };

  useEffect(() => {
    setMessages([createInitialMessage(t)]);
  }, [t]);

  return {
    userInput,
    setUserInput,
    messages,
    inputDisabled,
    isGenerating,
    assistantStartedResponding,
    handleSubmit,
    handleSuggestionClick,
    stopGeneration,
  };
}
