"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Box, Flex, HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuBot,
  LuCheck,
  LuCircleAlert,
  LuDatabase,
  LuFilePlus2,
  LuLightbulb,
  LuPencil,
  LuRefreshCw,
  LuSend,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
  ConceptNoteGap,
} from "@/util/types";

import {
  getFocusedConceptNoteGap,
  getGapInterviewPresentation,
  getGapSummaryQuestions,
  getOpenConceptNoteGaps,
} from "./gap-interview";
import { useConceptNoteChat } from "./use-concept-note-chat";

interface ConceptNoteChatPanelProps {
  bundleStatus: string | null;
  documentGrounding: "none" | "uploaded_evidence" | null;
  draft: ConceptNoteDraftState | null;
  isConfirmingChapter: boolean;
  isResolvingGap: boolean;
  lng: string;
  mutationError: string | null;
  onConfirmChapter: (chapter: ConceptNoteDraftChapter) => Promise<void>;
  onOpenContext: () => void;
  onReviewDraft: () => void;
  onResolveGap: (
    gap: ConceptNoteGap,
    action: "answer" | "correction" | "not_a_gap" | "defer_as_caveat",
    answer?: string,
  ) => Promise<void>;
  reviewGapChapterId: string | null;
  reviewGapId: string | null;
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
  draft,
  isConfirmingChapter,
  isResolvingGap,
  lng,
  mutationError,
  onConfirmChapter,
  onOpenContext,
  onReviewDraft,
  onResolveGap,
  reviewGapChapterId,
  reviewGapId,
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
  const [answeringGapId, setAnsweringGapId] = useState<string | null>(null);
  const [gapInterviewActive, setGapInterviewActive] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const focusedGapCardRef = useRef<HTMLDivElement | null>(null);
  const initiallyScrolledThreadRef = useRef<string | null>(null);
  const chapters = draft?.chapters ?? [];
  const allGaps = chapters.flatMap((chapter) => chapter.gaps);
  const openGaps = getOpenConceptNoteGaps(allGaps);
  const gapInterviewPresentation = getGapInterviewPresentation(
    openGaps.length,
    gapInterviewActive,
  );
  const showFocusedGap = gapInterviewPresentation === "question";
  const focusedGap = getFocusedConceptNoteGap(
    chapters,
    draft?.focused_gap_id,
    reviewGapId,
    reviewGapChapterId,
  );
  const focusedGapId = focusedGap?.gap_id ?? null;
  const answeringGap =
    allGaps.find((gap) => gap.gap_id === answeringGapId) ?? null;
  const focusedChapter = focusedGap
    ? chapters.find((chapter) =>
        chapter.gaps.some((gap) => gap.gap_id === focusedGap.gap_id),
      )
    : null;
  const reviewChapter =
    chapters.find(
      (chapter) =>
        chapter.status === "draft" &&
        chapter.open_gap_count === 0 &&
        chapter.regeneration_status === "idle",
    ) ?? null;
  const latestResolvedGap = allGaps
    .filter((gap) => gap.state === "resolved" || gap.state === "caveat")
    .sort(
      (left, right) =>
        new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime(),
    )[0];
  const failedGap = chapters
    .find((chapter) => chapter.regeneration_status === "failed")
    ?.gaps.find((gap) => gap.state === "processing" && gap.resolution);
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
    if (!reviewGapChapterId || !focusedGapId) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setGapInterviewActive(true);
      setAnsweringGapId(null);
      setInput("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedGapId, reviewGapChapterId, reviewGapId]);

  useEffect(() => {
    if (!showFocusedGap || !focusedGapId) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      focusedGapCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answeringGapId, focusedGapId, showFocusedGap]);

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

  async function submitMessage(
    event: FormEvent<HTMLDivElement>,
  ): Promise<void> {
    event.preventDefault();
    const content = input.trim();
    if (!content) {
      return;
    }
    setInput("");
    if (answeringGap) {
      await onResolveGap(
        answeringGap,
        answeringGap.state === "open" ? "answer" : "correction",
        content,
      );
      setAnsweringGapId(null);
      return;
    }
    await sendChatMessage(content);
  }

  function beginAnswer(gap: ConceptNoteGap, value = ""): void {
    setAnsweringGapId(gap.gap_id);
    setInput(value);
  }

  async function retryFailedGap(gap: ConceptNoteGap): Promise<void> {
    const resolution = gap.resolution;
    if (!resolution || resolution.action === "evidence_update") {
      return;
    }
    const action =
      resolution.action === "answer" || resolution.action === "correction"
        ? "correction"
        : resolution.action;
    await onResolveGap(gap, action, resolution.answer ?? undefined);
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
        ref={chatScrollRef}
        align="stretch"
        gap={4}
        flex={1}
        minH={0}
        overflowY="auto"
        bg="background.alternativeLight"
        p={4}
      >
        {gapInterviewPresentation === "hidden" && (
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
        )}

        {gapInterviewPresentation === "summary" && (
          <Box
            border="1px solid"
            borderColor="sentiment.positiveDefault"
            borderRadius="rounded"
            bg="base.light"
            p={4}
            data-testid="concept-note-gap-summary"
          >
            <HStack gap={2} color="sentiment.positiveDefault">
              <Icon as={LuCheck} />
              <Text
                fontSize="10px"
                fontWeight="semibold"
                letterSpacing="1.5px"
                textTransform="uppercase"
              >
                {t("gap-context-assembled")}
              </Text>
            </HStack>
            <Text
              mt={2}
              fontFamily="heading"
              fontSize="body.md"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("gap-summary-title", { count: openGaps.length })}
            </Text>
            <Text
              mt={3}
              fontSize="10px"
              fontWeight="semibold"
              color="sentiment.positiveDefault"
              letterSpacing="1.5px"
              textTransform="uppercase"
            >
              {t("gap-summary-missing")}
            </Text>
            <Text
              mt={1}
              fontSize="label.sm"
              lineHeight="20px"
              color="content.secondary"
            >
              {t("gap-summary-description", {
                gaps: getGapSummaryQuestions(openGaps),
              })}
            </Text>
            <HStack mt={4} gap={2} flexWrap="wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setGapInterviewActive(true)}
              >
                {t("gap-start-interview")}
              </Button>
              <Button size="sm" variant="outline" onClick={onReviewDraft}>
                {t("gap-review-draft-first")}
              </Button>
            </HStack>
          </Box>
        )}

        {failedGap?.resolution && (
          <Box
            border="1px solid"
            borderColor="sentiment.negativeDefault"
            borderRadius="rounded"
            bg="sentiment.negativeOverlay"
            p={4}
          >
            <HStack gap={2} color="sentiment.negativeDefault">
              <Icon as={LuCircleAlert} />
              <Text fontSize="label.sm" fontWeight="semibold">
                {t("gap-regeneration-failed-title")}
              </Text>
            </HStack>
            <Text mt={2} fontSize="body.sm" color="content.primary">
              {failedGap.question}
            </Text>
            {failedGap.resolution.answer && (
              <Text mt={1} fontSize="label.sm" color="content.secondary">
                {failedGap.resolution.answer}
              </Text>
            )}
            <Text mt={2} fontSize="label.sm" color="content.secondary">
              {t("gap-regeneration-failed-description")}
            </Text>
            <Button
              mt={3}
              size="sm"
              variant="outline"
              loading={isResolvingGap}
              onClick={() => void retryFailedGap(failedGap)}
            >
              <Icon as={LuRefreshCw} />
              {t("retry")}
            </Button>
          </Box>
        )}

        {reviewChapter && (
          <Box
            border="1px solid"
            borderColor="content.link"
            borderRadius="rounded"
            bg="base.light"
            p={4}
          >
            <Text
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("chapter-ready-for-review", { chapter: reviewChapter.title })}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.secondary">
              {t("chapter-review-required-description")}
            </Text>
            <Button
              mt={3}
              size="sm"
              variant="solid"
              loading={isConfirmingChapter}
              onClick={() => void onConfirmChapter(reviewChapter)}
            >
              <Icon as={LuCheck} />
              {t("review-and-confirm")}
            </Button>
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

        {latestResolvedGap?.resolution && (
          <Box
            border="1px solid"
            borderColor="sentiment.positiveDefault"
            borderRadius="rounded"
            bg="sentiment.positiveOverlay"
            p={4}
          >
            <HStack gap={2} color="sentiment.positiveDefault">
              <Icon as={LuCheck} />
              <Text fontSize="label.sm" fontWeight="semibold">
                {t(
                  latestResolvedGap.state === "caveat"
                    ? "gap-caveat-kept"
                    : "gap-resolved",
                )}
              </Text>
            </HStack>
            <Text mt={2} fontSize="body.sm" color="content.primary">
              {latestResolvedGap.question}
            </Text>
            {latestResolvedGap.resolution.answer && (
              <Text mt={1} fontSize="label.sm" color="content.secondary">
                {latestResolvedGap.resolution.answer}
              </Text>
            )}
            {latestResolvedGap.resolution.source_refs.length > 0 && (
              <Text mt={1} fontSize="10px" color="content.tertiary">
                {t("gap-suggestion-sources", {
                  sources: latestResolvedGap.resolution.source_refs.join(", "),
                })}
              </Text>
            )}
            <Text mt={2} fontSize="10px" color="content.tertiary">
              {t(
                latestResolvedGap.resolution.actor_user_id === "system"
                  ? "gap-updated-from-source"
                  : "gap-confirmed-by-you",
                {
                  date: new Intl.DateTimeFormat(lng, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(latestResolvedGap.resolution.created_at)),
                },
              )}
            </Text>
            <Button
              mt={3}
              size="xs"
              variant="ghost"
              disabled={isResolvingGap}
              onClick={() =>
                beginAnswer(
                  latestResolvedGap,
                  latestResolvedGap.resolution?.answer ?? "",
                )
              }
            >
              <Icon as={LuPencil} />
              {t("gap-correct-answer")}
            </Button>
          </Box>
        )}

        {showFocusedGap && focusedGap && focusedChapter && (
          <Box
            ref={focusedGapCardRef}
            border="1px solid"
            borderColor="sentiment.warningDefault"
            borderRadius="rounded"
            bg="base.light"
            p={4}
            data-testid="concept-note-focused-gap"
          >
            <HStack justify="space-between" gap={2} align="start">
              <Box>
                <Text
                  fontSize="10px"
                  fontWeight="semibold"
                  color="sentiment.warningDefault"
                  letterSpacing="1.5px"
                  textTransform="uppercase"
                >
                  {t("gap-quick-decision")}
                </Text>
                <Text mt={1} fontSize="label.sm" color="content.tertiary">
                  {focusedChapter.title}
                </Text>
              </Box>
              <Text
                borderRadius="pill"
                bg="sentiment.warningOverlay"
                px={2}
                py={1}
                fontSize="10px"
                fontWeight="semibold"
                color="sentiment.warningDefault"
              >
                {t(
                  focusedGap.severity === "critical"
                    ? "gap-critical"
                    : "gap-noncritical",
                )}
              </Text>
            </HStack>
            <Text
              mt={3}
              fontFamily="heading"
              fontSize="body.md"
              fontWeight="semibold"
              color="content.primary"
            >
              {focusedGap.question}
            </Text>
            <Box mt={3} borderRadius="rounded" bg="background.neutral" p={3}>
              <Text
                fontSize="label.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {t("gap-why-asking")}
              </Text>
              <Text
                mt={1}
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {focusedGap.why_asking}
              </Text>
            </Box>

            {focusedGap.suggestions.length > 0 && (
              <VStack align="stretch" mt={3} gap={2}>
                <Text
                  fontSize="label.sm"
                  fontWeight="semibold"
                  color="content.secondary"
                >
                  {t("gap-grounded-suggestions")}
                </Text>
                {focusedGap.suggestions.map((suggestion) => (
                  <Button
                    key={`${focusedGap.gap_id}-${suggestion.value}`}
                    size="sm"
                    variant="outline"
                    justifyContent="flex-start"
                    h="auto"
                    py={2}
                    whiteSpace="normal"
                    disabled={isResolvingGap}
                    onClick={() => beginAnswer(focusedGap, suggestion.value)}
                  >
                    <Icon as={LuLightbulb} flexShrink={0} />
                    {suggestion.value}
                  </Button>
                ))}
                <Text fontSize="10px" color="content.tertiary">
                  {t("gap-suggestion-sources", {
                    sources: focusedGap.source_refs.join(", "),
                  })}
                </Text>
              </VStack>
            )}

            <HStack mt={4} gap={2} flexWrap="wrap">
              <Button
                size="sm"
                variant="solid"
                disabled={isResolvingGap}
                onClick={() => beginAnswer(focusedGap)}
              >
                <Icon as={LuPencil} />
                {t("gap-answer")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!threadId || isGenerating}
                onClick={() =>
                  void sendChatMessage(
                    t("gap-show-examples-prompt", {
                      question: focusedGap.question,
                    }),
                  )
                }
              >
                {t("gap-show-examples")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isResolvingGap}
                onClick={() => void onResolveGap(focusedGap, "not_a_gap")}
              >
                {t("gap-not-a-gap")}
              </Button>
              {focusedGap.severity === "noncritical" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isResolvingGap}
                  onClick={() =>
                    void onResolveGap(focusedGap, "defer_as_caveat")
                  }
                >
                  {t("gap-not-clear-yet")}
                </Button>
              )}
            </HStack>
          </Box>
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
        {mutationError && (
          <HStack
            role="alert"
            align="start"
            gap={2}
            color="sentiment.negativeDefault"
          >
            <Icon as={LuCircleAlert} mt={0.5} />
            <Text fontSize="label.sm">{mutationError}</Text>
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
        {answeringGap && (
          <Flex
            align="start"
            justify="space-between"
            gap={3}
            mb={2}
            borderRadius="rounded"
            bg="sentiment.warningOverlay"
            p={2.5}
          >
            <Box minW={0}>
              <Text
                fontSize="10px"
                fontWeight="semibold"
                color="sentiment.warningDefault"
              >
                {t("gap-answer-mode")}
              </Text>
              <Text
                truncate
                mt={0.5}
                fontSize="label.sm"
                color="content.secondary"
              >
                {answeringGap.question}
              </Text>
            </Box>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={isResolvingGap}
              onClick={() => {
                setAnsweringGapId(null);
                setInput("");
              }}
            >
              {t("cancel")}
            </Button>
          </Flex>
        )}
        <Box position="relative">
          <Input
            value={input}
            disabled={
              answeringGap
                ? isResolvingGap
                : !threadId || historyLoading || isGenerating
            }
            placeholder={
              answeringGap
                ? t("gap-answer-placeholder")
                : threadId
                  ? t("chat-input-placeholder")
                  : t("chat-unavailable")
            }
            bg="background.neutral"
            borderColor="border.neutral"
            pr="44px"
            onChange={(event) => setInput(event.target.value)}
          />
          <Button
            type="submit"
            position="absolute"
            top="50%"
            right="6px"
            transform="translateY(-50%)"
            boxSize="28px"
            minW="28px"
            p={0}
            disabled={
              !input.trim() ||
              (answeringGap ? isResolvingGap : !threadId || historyLoading)
            }
            loading={answeringGap ? isResolvingGap : isGenerating}
            size="xs"
            variant="solid"
            aria-label={t(answeringGap ? "submit-answer" : "send-message")}
          >
            <Icon as={LuSend} boxSize={3.5} />
          </Button>
        </Box>
        {!threadId && !answeringGap && (
          <Text mt={2} fontSize="label.sm" color="content.tertiary">
            {t("chat-thread-unavailable")}
          </Text>
        )}
      </Box>
    </VStack>
  );
}
