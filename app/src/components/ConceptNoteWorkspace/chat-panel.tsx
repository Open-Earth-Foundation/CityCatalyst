"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Box, Flex, HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuArrowUp,
  LuCircleAlert,
  LuDatabase,
  LuFilePlus2,
  LuMessageSquarePlus,
} from "react-icons/lu";
import { BsStars } from "react-icons/bs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import { useConceptNoteChat } from "./use-concept-note-chat";
import type { EditController } from "./document-review";
import type { EditScope } from "@/util/concept-note-edit-types";

interface ConceptNoteChatPanelProps {
  bundleStatus: string | null;
  composerRequest: { content: string; id: string } | null;
  documentGrounding: "none" | "uploaded_evidence" | null;
  lng: string;
  onOpenContext: () => void;
  onStartNewChat?: () => void;
  threadId: string | null;
  editScope: EditScope;
  edits: EditController;
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
const typingDotBounce = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-4px);
  }
`;

function TypingIndicator({ label }: { label: string }) {
  return (
    <HStack
      role="status"
      aria-label={label}
      data-testid="concept-note-typing-indicator"
      gap={1}
      minH="22px"
    >
      {[0, 1, 2].map((index) => (
        <Box
          as="span"
          key={index}
          aria-hidden="true"
          data-testid="concept-note-typing-dot"
          boxSize="6px"
          borderRadius="full"
          bg="content.secondary"
          animation={`${typingDotBounce} 900ms ease-in-out ${index * 120}ms infinite`}
          _motionReduce={{ animation: "none" }}
        />
      ))}
    </HStack>
  );
}

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
  composerRequest,
  documentGrounding,
  lng,
  onOpenContext,
  onStartNewChat,
  threadId,
  editScope,
  edits,
}: ConceptNoteChatPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const {
    error: chatError,
    historyLoading,
    isGenerating,
    messages,
    sendMessage: sendChatMessage,
  } = useConceptNoteChat({
    lng,
    threadId,
    editScope,
    onProposal: edits.loadProposal,
  });
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const initiallyScrolledThreadRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (
      !threadId ||
      historyLoading ||
      messages.length === 0 ||
      initiallyScrolledThreadRef.current === threadId
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const chatScroll = chatScrollRef.current;
      if (!chatScroll) {
        return;
      }
      chatScroll.scrollTo({
        behavior: "auto",
        top: chatScroll.scrollHeight,
      });
      initiallyScrolledThreadRef.current = threadId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [historyLoading, messages.length, threadId]);

  useEffect(() => {
    if (!composerRequest) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      setInput(composerRequest.content);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [composerRequest]);

  async function submitMessage(
    event: FormEvent<HTMLDivElement>,
  ): Promise<void> {
    event.preventDefault();
    const content = input.trim();
    if (!content) {
      return;
    }
    setInput("");
    await sendChatMessage(content);
  }

  return (
    <VStack
      align="stretch"
      gap={0}
      h="full"
      minH={0}
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
          boxSize="44px"
          align="center"
          justify="center"
          borderRadius="full"
          bg="sentiment.positiveDefault"
          color="base.light"
        >
          <Icon as={BsStars} boxSize={6} />
        </Flex>
        <Box flex={1}>
          <Text
            fontFamily="heading"
            fontSize="18px"
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
        {onStartNewChat && (
          <Button
            size="xs"
            variant="ghost"
            px={2}
            aria-label={t("start-new-chat")}
            title={t("start-new-chat")}
            data-testid="concept-note-start-new-chat"
            disabled={!threadId || historyLoading || isGenerating}
            onClick={onStartNewChat}
          >
            <Icon as={LuMessageSquarePlus} boxSize={4} />
          </Button>
        )}
      </Flex>

      <VStack
        ref={chatScrollRef}
        data-testid="concept-note-chat-scroll"
        align="stretch"
        gap={4}
        flex={1}
        minH={0}
        overflowY="auto"
        bg="base.light"
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
            {message.role === "assistant" && message.text ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={assistantMarkdownComponents}
              >
                {message.text}
              </ReactMarkdown>
            ) : message.role === "assistant" ? (
              <TypingIndicator label={t("chat-generating")} />
            ) : (
              <Text
                fontSize="body.sm"
                lineHeight="22px"
                color="content.primary"
                whiteSpace="pre-wrap"
              >
                {message.text}
              </Text>
            )}
          </Box>
        ))}

        {edits.error && (
          <Text role="alert" fontSize="label.sm" color="content.primary">
            {t(
              edits.error === "stale_base"
                ? "edit-stale-hint"
                : "edit-request-error",
            )}
          </Text>
        )}
        {edits.error && (
          <Button
            size="xs"
            minH="36px"
            variant="outline"
            data-testid="concept-note-edit-refresh"
            onClick={() => void edits.refresh()}
          >
            {t("edit-refresh")}
          </Button>
        )}
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
        p={4}
        flexShrink={0}
        onSubmit={submitMessage}
      >
        <Flex align="center" gap={3}>
          <Input
            data-testid="concept-note-chat-input"
            aria-label={t("chat-input-placeholder")}
            ref={inputRef}
            value={input}
            disabled={!threadId || historyLoading || isGenerating}
            placeholder={
              threadId ? t("chat-input-placeholder") : t("chat-unavailable")
            }
            bg="base.light"
            borderColor="border.neutral"
            minH="52px"
            minW={0}
            flex={1}
            fontSize="14px"
            borderRadius="rounded"
            onChange={(event) => setInput(event.target.value)}
          />
          <Button
            type="submit"
            data-testid="concept-note-chat-send"
            boxSize="48px"
            minW="48px"
            flexShrink={0}
            bg="interactive.primary"
            _hover={{
              bg: "interactive.primary",
              color: "base.light",
              opacity: 0.9,
            }}
            _disabled={{
              bg: "interactive.primary",
              color: "base.light",
              opacity: 1,
              cursor: "not-allowed",
              _hover: {
                bg: "interactive.primary",
                color: "base.light",
                opacity: 1,
              },
            }}
            p={0}
            disabled={!input.trim() || !threadId || historyLoading}
            loading={isGenerating}
            size="xs"
            variant="solid"
            aria-label={t("send-message")}
          >
            <Icon as={LuArrowUp} boxSize={5} />
          </Button>
        </Flex>
        {!threadId && (
          <Text mt={2} fontSize="label.sm" color="content.tertiary">
            {t("chat-thread-unavailable")}
          </Text>
        )}
      </Box>
    </VStack>
  );
}
