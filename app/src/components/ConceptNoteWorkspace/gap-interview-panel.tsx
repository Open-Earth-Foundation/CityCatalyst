"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Box, Flex, HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import {
  LuCheck,
  LuCircleAlert,
  LuLightbulb,
  LuPencil,
  LuRefreshCw,
  LuSend,
} from "react-icons/lu";

import { useTranslation } from "@/i18n/client";
import type { ConceptNoteDraftState, ConceptNoteGap } from "@/util/types";

import {
  getFocusedConceptNoteGap,
  getGapInterviewPresentation,
  getGapSummaryQuestions,
  getOpenConceptNoteGaps,
} from "./gap-interview";
import { ReviewButton as Button } from "./review-button";

export type GapResolutionAction =
  "answer" | "correction" | "not_a_gap" | "defer_as_caveat";

export interface GapReviewRequest {
  chapterId: string;
  gapId: string | null;
  requestId: string;
}

export interface GapInterviewControls {
  draft: ConceptNoteDraftState | null;
  isResolvingGap: boolean;
  mutationError: string | null;
  onResolveGap: (
    gap: ConceptNoteGap,
    action: GapResolutionAction,
    answer?: string,
  ) => Promise<void>;
  onReviewDraft: () => void;
  reviewRequest: GapReviewRequest | null;
}

interface GapInterviewPanelProps extends GapInterviewControls {
  askClimaDisabled: boolean;
  lng: string;
  onAskClima: (prompt: string) => void;
}

export function GapInterviewPanel({
  askClimaDisabled,
  draft,
  isResolvingGap,
  lng,
  mutationError,
  onAskClima,
  onResolveGap,
  onReviewDraft,
  reviewRequest,
}: GapInterviewPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [interviewActive, setInterviewActive] = useState(false);
  const [answeringGapId, setAnsweringGapId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const focusedCardRef = useRef<HTMLDivElement | null>(null);

  const chapters = draft?.chapters ?? [];
  const allGaps = chapters.flatMap((chapter) => chapter.gaps);
  const openGaps = getOpenConceptNoteGaps(allGaps);
  const presentation = getGapInterviewPresentation(
    openGaps.length,
    interviewActive,
  );
  const focusedGap = getFocusedConceptNoteGap(
    chapters,
    draft?.focused_gap_id,
    reviewRequest?.gapId,
    reviewRequest?.chapterId,
  );
  const focusedChapter = focusedGap
    ? chapters.find((chapter) =>
        chapter.gaps.some((gap) => gap.gap_id === focusedGap.gap_id),
      )
    : null;
  const answeringGap =
    allGaps.find((gap) => gap.gap_id === answeringGapId) ?? null;
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
  const processingGapCount = allGaps.filter(
    (gap) => gap.state === "processing",
  ).length;

  useEffect(() => {
    if (!reviewRequest) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setInterviewActive(true);
      setAnsweringGapId(null);
      setAnswer("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reviewRequest]);

  const focusedGapId = focusedGap?.gap_id ?? null;

  useEffect(() => {
    if (presentation !== "question" || !focusedGapId) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      focusedCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answeringGapId, focusedGapId, presentation]);

  function beginAnswer(gap: ConceptNoteGap, value = ""): void {
    setAnsweringGapId(gap.gap_id);
    setAnswer(value);
  }

  async function submitAnswer(event: FormEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    const content = answer.trim();
    if (!answeringGap || !content) {
      return;
    }
    await onResolveGap(
      answeringGap,
      answeringGap.state === "open" ? "answer" : "correction",
      content,
    );
    setAnsweringGapId(null);
    setAnswer("");
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

  const answerForm = answeringGap && (
    <Box
      as="form"
      mt={4}
      borderRadius="rounded"
      bg="sentiment.warningOverlay"
      p={3}
      onSubmit={submitAnswer}
      data-testid="concept-note-gap-answer-form"
    >
      <Flex align="start" justify="space-between" gap={3} mb={2}>
        <Box minW={0}>
          <Text
            fontSize="10px"
            fontWeight="semibold"
            color="sentiment.warningDefault"
          >
            {t("gap-answer-mode")}
          </Text>
          <Text truncate mt={0.5} fontSize="label.sm" color="content.secondary">
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
            setAnswer("");
          }}
        >
          {t("cancel")}
        </Button>
      </Flex>
      <Flex align="center" gap={2}>
        <Input
          autoFocus
          data-testid="concept-note-gap-answer-input"
          aria-label={t("gap-answer-placeholder")}
          value={answer}
          disabled={isResolvingGap}
          placeholder={t("gap-answer-placeholder")}
          bg="base.light"
          borderColor="border.neutral"
          flex={1}
          minW={0}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="solid"
          data-testid="concept-note-gap-answer-submit"
          aria-label={t("submit-answer")}
          disabled={!answer.trim() || isResolvingGap}
          loading={isResolvingGap}
        >
          <Icon as={LuSend} />
        </Button>
      </Flex>
    </Box>
  );

  return (
    <VStack align="stretch" gap={4} data-testid="concept-note-gap-interview">
      {presentation === "summary" && (
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
          <Text mt={2} fontSize="label.sm" color="content.tertiary">
            {t("gap-chat-alternative")}
          </Text>
          <HStack mt={4} gap={2} flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              data-testid="concept-note-gap-start-interview"
              onClick={() => setInterviewActive(true)}
            >
              {t("gap-start-interview")}
            </Button>
            <Button size="sm" variant="outline" onClick={onReviewDraft}>
              {t("gap-review-draft-first")}
            </Button>
          </HStack>
        </Box>
      )}

      {processingGapCount > 0 && !failedGap && (
        <HStack
          gap={2}
          color="content.link"
          data-testid="concept-note-gap-regenerating"
        >
          <Icon as={LuRefreshCw} />
          <Text fontSize="label.sm">{t("chapter-regenerating")}</Text>
        </HStack>
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

      {latestResolvedGap?.resolution && (
        <Box
          border="1px solid"
          borderColor="sentiment.positiveDefault"
          borderRadius="rounded"
          bg="sentiment.positiveOverlay"
          p={4}
          data-testid="concept-note-gap-resolved"
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
          <HStack mt={3} justify="space-between" align="center" gap={3}>
            <Button
              size="xs"
              variant="ghost"
              color="content.link"
              flexShrink={0}
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
            <VStack gap={0} align="end" textAlign="right">
              <Text fontSize="10px" lineHeight="12px" color="content.tertiary">
                {t(
                  latestResolvedGap.resolution.actor_user_id === "system"
                    ? "gap-updated-from-source-label"
                    : "gap-confirmed-by-you-label",
                )}
              </Text>
              <Text fontSize="10px" lineHeight="12px" color="content.tertiary">
                {new Intl.DateTimeFormat(lng, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(latestResolvedGap.resolution.created_at))}
              </Text>
            </VStack>
          </HStack>
          {answeringGap?.gap_id === latestResolvedGap.gap_id && answerForm}
        </Box>
      )}

      {presentation === "question" && focusedGap && focusedChapter && (
        <Box
          ref={focusedCardRef}
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
                  textAlign="left"
                  disabled={isResolvingGap}
                  onClick={() => beginAnswer(focusedGap, suggestion.value)}
                >
                  <Icon as={LuLightbulb} flexShrink={0} />
                  {suggestion.value}
                </Button>
              ))}
              {focusedGap.source_refs.length > 0 && (
                <Text fontSize="10px" color="content.tertiary">
                  {t("gap-suggestion-sources", {
                    sources: focusedGap.source_refs.join(", "),
                  })}
                </Text>
              )}
            </VStack>
          )}

          <HStack mt={4} gap={2} flexWrap="wrap">
            <Button
              size="sm"
              variant="solid"
              data-testid="concept-note-gap-answer"
              disabled={isResolvingGap}
              onClick={() => beginAnswer(focusedGap)}
            >
              <Icon as={LuPencil} />
              {t("gap-answer")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={askClimaDisabled}
              onClick={() =>
                onAskClima(
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
              data-testid="concept-note-gap-not-a-gap"
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
                onClick={() => void onResolveGap(focusedGap, "defer_as_caveat")}
              >
                {t("gap-not-clear-yet")}
              </Button>
            )}
          </HStack>
          {answeringGap?.gap_id === focusedGap.gap_id && answerForm}
        </Box>
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
  );
}
