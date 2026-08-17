"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { Box, Flex, HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import {
  LuArrowRight,
  LuBot,
  LuCircleAlert,
  LuDatabase,
  LuFilePlus2,
  LuSend,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import { useConceptNoteChat } from "./use-concept-note-chat";

interface ConceptNoteChatPanelProps {
  bundleStatus: string | null;
  contextMode: "thin" | "grounded" | null;
  lng: string;
  onOpenContext: () => void;
  threadId: string | null;
}

export function ConceptNoteChatPanel({
  bundleStatus,
  contextMode,
  lng,
  onOpenContext,
  threadId,
}: ConceptNoteChatPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [input, setInput] = useState("");
  const {
    error: chatError,
    historyLoading,
    isGenerating,
    messages,
    sendMessage: sendChatMessage,
  } = useConceptNoteChat({ lng, threadId });
  const groundedContext =
    bundleStatus === "ready" && contextMode === "grounded";
  const contextStatus = groundedContext
    ? {
        actionIcon: LuArrowRight,
        actionLabel: t("review-context"),
        color: "sentiment.positiveDefault",
        description: t("clima-context-ready-message"),
        icon: LuDatabase,
        surface: "sentiment.positiveOverlay",
        title: t("source-context-assembled"),
      }
    : {
        actionIcon: LuFilePlus2,
        actionLabel: t("add-recommended-source"),
        color: "content.link",
        description: t("clima-thin-context-message"),
        icon: LuCircleAlert,
        surface: "background.neutral",
        title: t("thin-context-ready"),
      };

  async function submitMessage(
    event: FormEvent<HTMLDivElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    const content = input;
    setInput("");
    await sendChatMessage(content);
  }

  return (
    <VStack
      align="stretch"
      gap={0}
      h={{ base: "auto", xl: "calc(100vh - 184px)" }}
      minH={{ xl: "650px" }}
      overflow="hidden"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      boxShadow="1dp"
    >
      <Flex
        align="center"
        gap={3}
        borderBottom="1px solid"
        borderColor="border.neutral"
        px={4}
        py={3}
      >
        <Flex
          boxSize="36px"
          align="center"
          justify="center"
          borderRadius="full"
          bg="sentiment.positiveDefault"
          color="base.light"
        >
          <Icon as={LuBot} boxSize={4.5} />
        </Flex>
        <Box flex={1}>
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("clima")}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("concept-note-copilot")}
          </Text>
        </Box>
        <HStack
          gap={1.5}
          color={threadId ? "sentiment.positiveDefault" : "content.tertiary"}
        >
          <Box
            boxSize="7px"
            borderRadius="full"
            bg={threadId ? "sentiment.positiveDefault" : "content.tertiary"}
          />
          <Text fontSize="label.sm">
            {threadId ? t("connected") : t("not-connected")}
          </Text>
        </HStack>
      </Flex>

      <VStack
        align="stretch"
        gap={4}
        flex={1}
        overflowY={{ xl: "auto" }}
        bg="background.alternativeLight"
        p={4}
      >
        <Flex
          align="start"
          gap={3}
          border="1px solid"
          borderColor={contextStatus.color}
          borderRadius="rounded"
          bg={contextStatus.surface}
          p={4}
        >
          <Icon as={contextStatus.icon} mt={0.5} color={contextStatus.color} />
          <Box flex={1}>
            <Text
              fontFamily="heading"
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {contextStatus.title}
            </Text>
            <Text
              mt={1}
              fontSize="label.sm"
              lineHeight="20px"
              color="content.secondary"
            >
              {contextStatus.description}
            </Text>
            <Button mt={3} size="xs" variant="outline" onClick={onOpenContext}>
              <Icon as={contextStatus.actionIcon} />
              {contextStatus.actionLabel}
            </Button>
          </Box>
        </Flex>

        {messages.map((message) => (
          <Box
            key={message.id}
            alignSelf={message.role === "user" ? "end" : "start"}
            maxW="92%"
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            bg={message.role === "user" ? "background.neutral" : "base.light"}
            px={3}
            py={2.5}
          >
            <Text fontSize="body.sm" lineHeight="22px" color="content.primary">
              {message.text || t("chat-thinking")}
            </Text>
          </Box>
        ))}

        {chatError && (
          <HStack
            role="alert"
            align="start"
            gap={2}
            color="sentiment.negativeDefault"
          >
            <Icon as={LuCircleAlert} mt={0.5} />
            <Text fontSize="label.sm">{chatError}</Text>
          </HStack>
        )}
      </VStack>

      <Box
        as="form"
        borderTop="1px solid"
        borderColor="border.neutral"
        p={3}
        onSubmit={submitMessage}
      >
        <HStack gap={2}>
          <Input
            value={input}
            disabled={!threadId || historyLoading || isGenerating}
            placeholder={
              threadId ? t("chat-input-placeholder") : t("chat-unavailable")
            }
            bg="background.neutral"
            borderColor="border.neutral"
            onChange={(event) => setInput(event.target.value)}
          />
          <Button
            type="submit"
            disabled={!threadId || !input.trim() || historyLoading}
            loading={isGenerating}
            size="sm"
            variant="solid"
            aria-label={t("send-message")}
          >
            <Icon as={LuSend} />
          </Button>
        </HStack>
        <Text mt={2} fontSize="label.sm" color="content.tertiary">
          {threadId
            ? t("source-upload-recommended-chat")
            : t("chat-thread-unavailable")}
        </Text>
      </Box>
    </VStack>
  );
}
