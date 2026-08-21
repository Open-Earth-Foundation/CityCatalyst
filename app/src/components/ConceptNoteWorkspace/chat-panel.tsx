"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { Box, Flex, HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuBot,
  LuCircleAlert,
  LuDatabase,
  LuFilePlus2,
  LuSend,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import { useConceptNoteChat } from "./use-concept-note-chat";

interface ConceptNoteChatPanelProps {
  bundleStatus: string | null;
  documentGrounding: "none" | "uploaded_evidence" | null;
  lng: string;
  onOpenContext: () => void;
  threadId: string | null;
}

interface ContextStatusNoticeProps {
  autoDismissAfterMs?: number;
  onOpenContext: () => void;
  status: {
    actionIcon: IconType;
    actionLabel: string;
    color: string;
    description: string;
    icon: IconType;
    surface: string;
    title: string;
  };
}

const CONTEXT_READY_NOTICE_DURATION_MS = 30_000;

function ContextStatusNotice({
  autoDismissAfterMs,
  onOpenContext,
  status,
}: ContextStatusNoticeProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoDismissAfterMs) {
      return;
    }

    const timeout = window.setTimeout(
      () => setVisible(false),
      autoDismissAfterMs,
    );
    return () => window.clearTimeout(timeout);
  }, [autoDismissAfterMs]);

  if (!visible) {
    return null;
  }

  return (
    <Flex
      align="start"
      gap={3}
      border="1px solid"
      borderColor={status.color}
      borderRadius="rounded"
      bg={status.surface}
      p={4}
      role={autoDismissAfterMs ? "status" : undefined}
    >
      <Icon as={status.icon} mt={0.5} color={status.color} />
      <Box flex={1}>
        <Text
          fontFamily="heading"
          fontSize="body.sm"
          fontWeight="semibold"
          color="content.primary"
        >
          {status.title}
        </Text>
        <Text
          mt={1}
          fontSize="label.sm"
          lineHeight="20px"
          color="content.secondary"
        >
          {status.description}
        </Text>
        <Button mt={3} size="xs" variant="outline" onClick={onOpenContext}>
          <Icon as={status.actionIcon} />
          {status.actionLabel}
        </Button>
      </Box>
    </Flex>
  );
}

const assistantMarkdownComponents = createChatMarkdownComponents({
  paragraph: {
    fontSize: "body.sm",
    lineHeight: "22px",
    color: "content.primary",
  },
  h1: {
    fontSize: "title.md",
    lineHeight: "24px",
    color: "content.primary",
  },
  h2: {
    fontSize: "body.md",
    lineHeight: "22px",
    color: "content.primary",
  },
  h3: {
    fontSize: "body.sm",
    lineHeight: "22px",
    color: "content.primary",
  },
  list: {
    lineHeight: "22px",
    color: "content.primary",
  },
  inlineColor: "content.primary",
  code: {
    bg: "background.neutral",
    fontSize: "label.sm",
    color: "content.primary",
  },
  pre: {
    bg: "background.neutral",
    borderRadius: "rounded",
    fontSize: "label.sm",
  },
  table: {
    fontSize: "label.sm",
    headBg: "background.neutral",
    color: "content.primary",
  },
  borderColor: "border.overlay",
  link: {
    color: "interactive.primary",
    fontWeight: "semibold",
    textDecoration: "underline",
  },
  blockquote: {
    borderColor: "border.overlay",
    color: "content.tertiary",
  },
});

export function ConceptNoteChatPanel({
  bundleStatus,
  documentGrounding,
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
  const hasUploadedEvidence =
    bundleStatus === "ready" && documentGrounding === "uploaded_evidence";
  const contextStatus = hasUploadedEvidence
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
        description: t("clima-no-uploaded-evidence-message"),
        icon: LuCircleAlert,
        surface: "background.neutral",
        title: t("uploaded-evidence-none"),
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
      h={{ base: "auto", md: "calc(100vh - 184px)" }}
      minH={{ md: "650px" }}
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
        overflowY={{ md: "auto" }}
        bg="background.alternativeLight"
        p={4}
      >
        <ContextStatusNotice
          key={
            hasUploadedEvidence ? "uploaded-evidence" : "no-uploaded-evidence"
          }
          autoDismissAfterMs={
            hasUploadedEvidence ? CONTEXT_READY_NOTICE_DURATION_MS : undefined
          }
          onOpenContext={onOpenContext}
          status={contextStatus}
        />

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
            {message.role === "assistant" ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={assistantMarkdownComponents}
              >
                {message.text || t("chat-thinking")}
              </ReactMarkdown>
            ) : (
              <Text
                fontSize="body.sm"
                lineHeight="22px"
                color="content.primary"
                whiteSpace="pre-wrap"
              >
                {message.text || t("chat-thinking")}
              </Text>
            )}
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
        {!threadId && (
          <Text mt={2} fontSize="label.sm" color="content.tertiary">
            {t("chat-thread-unavailable")}
          </Text>
        )}
      </Box>
    </VStack>
  );
}
