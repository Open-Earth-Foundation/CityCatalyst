"use client";

import React from "react";
import { Box } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useChat } from "@/hooks/useChat";
import { createSuggestions } from "@/utils/chatUtils";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSuggestions } from "./ChatSuggestions";
import { ChatInput } from "./ChatInput";

export interface ChatBotProps {
  userName?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  t: TFunction;
  inventoryId?: string;
  contextSuggestions?: { preview: string; message: string }[] | null;
}

export default function ChatBot({
  inputRef,
  t,
  inventoryId,
  contextSuggestions,
}: ChatBotProps) {
  const {
    userInput,
    setUserInput,
    messages,
    inputDisabled,
    isGenerating,
    assistantStartedResponding,
    handleSubmit,
    handleSuggestionClick,
    stopGeneration,
  } = useChat({ inventoryId, t });

  const suggestions = contextSuggestions ?? createSuggestions(t);

  return (
    <Box display="flex" flexDirection="column" w="full" flex="1" minH={0}>
      <ChatMessageList
        messages={messages}
        isGenerating={isGenerating}
        assistantStartedResponding={assistantStartedResponding}
      />

      <Box divideX="2px" mt={2} mb={6} borderColor="border.neutral" />

      <ChatSuggestions
        suggestions={suggestions}
        onSuggestionClick={handleSuggestionClick}
        disabled={inputDisabled}
      />

      <ChatInput
        value={userInput}
        onChange={setUserInput}
        onSubmit={handleSubmit}
        onStop={stopGeneration}
        disabled={inputDisabled}
        isGenerating={isGenerating}
        placeholder={t("ask-assistant")}
        sendLabel={t("send-message")}
        stopLabel={t("stop-generation")}
        inputRef={inputRef}
      />
    </Box>
  );
}
