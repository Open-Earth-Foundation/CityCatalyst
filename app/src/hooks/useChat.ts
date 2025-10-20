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
  removeLastEmptyAssistantMessage
} from "@/utils/chatUtils";
import { TFunction } from "i18next";

interface UseChatProps {
  inventoryId: string;
  t: TFunction;
}

export function useChat({ inventoryId, t }: UseChatProps) {
  const threadIdRef = useRef("");
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [assistantStartedResponding, setAssistantStartedResponding] = useState(false);
  
  const [createChatThread] = useCreateChatThreadMutation();

  const handleError = (error: any, errorMessage: string) => {
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
      setMessages(prev => appendToLastMessage(prev, content));
    },
    onComplete: () => {
      setInputDisabled(false);
      setIsGenerating(false);
      setAssistantStartedResponding(false);
    },
    onError: (error: string) => {
      // Remove empty assistant message if no response was received
      if (!assistantStartedResponding) {
        setMessages(prev => removeLastEmptyAssistantMessage(prev));
      }
      handleError(new Error(error), "Failed to send message. Please try again.");
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
      const threadId = await chatService.initializeThread(
        (data) => createChatThread(data).unwrap(),
        t
      );
      threadIdRef.current = threadId;
    }
  };

  const sendMessage = async (text: string) => {
    setAssistantStartedResponding(false);
    
    try {
      await initializeThread();

      // Create a custom startStream that uses the chat service
      await startStream(`/api/v1/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadIdRef.current,
          content: text,
        }),
      });
    } catch (error: any) {
      if (error.name !== "AbortError") {
        // Remove empty assistant message if no response was received
        if (!assistantStartedResponding) {
          setMessages(prev => removeLastEmptyAssistantMessage(prev));
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
    setMessages(prev => appendMessage(prev, "user", userInput));
    setMessages(prev => appendMessage(prev, "assistant", ""));
    setUserInput("");
    setInputDisabled(true);
    setIsGenerating(true);
  };

  const handleSuggestionClick = (message: string) => {
    sendMessage(message);
    setMessages(prev => appendMessage(prev, "user", message));
    setMessages(prev => appendMessage(prev, "assistant", ""));
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
    handleSubmit,
    handleSuggestionClick,
    stopGeneration,
  };
}