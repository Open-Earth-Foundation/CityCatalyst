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
        <Box
          alignSelf="start"
          maxW="92%"
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="rounded"
          borderTopLeftRadius="minimal"
          bg="base.light"
          p={4}
          boxShadow="1dp"
        >
          <Text fontSize="body.sm" lineHeight="24px" color="content.secondary">
            {groundedContext
              ? t("clima-context-ready-message")
              : t("clima-thin-context-message")}
          </Text>
        </Box>

        <VStack
          align="stretch"
          gap={3}
          border="1px solid"
          borderColor={
            groundedContext ? "sentiment.positiveDefault" : "content.link"
          }
          borderRadius="rounded"
          bg={
            groundedContext ? "sentiment.positiveOverlay" : "background.neutral"
          }
          p={4}
        >
          <HStack align="start" gap={2.5}>
            <Icon
              as={groundedContext ? LuDatabase : LuCircleAlert}
              mt={0.5}
              color={
                groundedContext ? "sentiment.positiveDefault" : "content.link"
              }
            />
            <Box flex={1}>
              <Text
                fontFamily="heading"
                fontSize="body.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {groundedContext
                  ? t("context-is-ready")
                  : t("thin-context-ready")}
              </Text>
              <Text
                mt={1}
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {groundedContext
                  ? t("context-ready-description")
                  : t("thin-context-description")}
              </Text>
            </Box>
          </HStack>
          <Button
            size="xs"
            variant="outline"
            alignSelf="start"
            onClick={onOpenContext}
          >
            <Icon as={groundedContext ? LuArrowRight : LuFilePlus2} />
            {groundedContext
              ? t("review-context")
              : t("add-recommended-source")}
          </Button>
        </VStack>

        {messages.length === 0 && !historyLoading && (
          <Box>
            <Text
              mb={2}
              fontFamily="heading"
              fontSize="overline"
              fontWeight="semibold"
              color="content.tertiary"
              textTransform="uppercase"
            >
              {t("suggested-next-steps")}
            </Text>
            <VStack align="stretch" gap={2}>
              {["quick-add-source", "quick-review-context"].map((key) => (
                <Button
                  key={key}
                  size="xs"
                  variant="outline"
                  justifyContent="start"
                  onClick={onOpenContext}
                >
                  {t(key)}
                </Button>
              ))}
            </VStack>
          </Box>
        )}

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
