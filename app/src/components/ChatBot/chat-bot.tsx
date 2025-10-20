"use client";

import React from "react";
import { Box } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useChat } from "@/hooks/useChat";
import { createSuggestions } from "@/utils/chatUtils";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSuggestions } from "./ChatSuggestions";
import { ChatInput } from "./ChatInput";

export default function ChatBot({
  inputRef,
  t,
  inventoryId,
}: {
  userName?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  t: TFunction;
  inventoryId: string;
}) {
  const {
    userInput,
    setUserInput,
    messages,
    inputDisabled,
    isGenerating,
    handleSubmit,
    handleSuggestionClick,
    stopGeneration,
  } = useChat({ inventoryId, t });

  const suggestions = createSuggestions(t);

  return (
    <Box display="flex" flexDirection="column" w="full" h="stretch">
      <ChatMessageList messages={messages} />

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
