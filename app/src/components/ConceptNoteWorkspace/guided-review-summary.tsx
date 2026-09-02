import { Box, Flex, Grid, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuArrowRight,
  LuCheck,
  LuCircleAlert,
  LuSearchCheck,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteChapterValidationStatus } from "@/util/types";

import type { DocumentReviewFinding } from "./chapter-validation";
import type { FailedChapterReview } from "./use-guided-review";

function statusTranslationKey(
  status: ConceptNoteChapterValidationStatus,
): string {
  if (status === "ready") return "validation-status-ready";
  if (status === "needs_review") return "validation-status-needs-review";
  return "validation-status-incomplete";
}

export function ReviewFindingList({
  chapterTitles,
  emptyKey,
  entries,
  lng,
  onOpenFinding,
}: {
  chapterTitles: Record<string, string>;
  emptyKey: string;
  entries: DocumentReviewFinding[];
  lng: string;
  onOpenFinding: (entry: DocumentReviewFinding) => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");

  if (entries.length === 0) {
    return (
      <HStack gap={2} py={5} color="sentiment.positiveDefault">
        <Icon as={LuCheck} />
        <Text fontSize="body.sm">{t(emptyKey)}</Text>
      </HStack>
    );
  }

  return (
    <VStack align="stretch" gap={0}>
      {entries.map((entry, index) => {
        const relatedChapters = entry.finding.involved_chapter_ids
          .filter((chapterId) => chapterId !== entry.chapterId)
          .map((chapterId) => chapterTitles[chapterId])
          .filter((title): title is string => Boolean(title));
        const isBlocking = entry.finding.severity === "blocking";

        return (
          <Box
            key={`${entry.chapterId}-${entry.finding.category}-${index}`}
            borderBottom="1px solid"
            borderColor="border.neutral"
            py={4}
          >
            <Flex align="start" justify="space-between" gap={4}>
              <Box minW={0}>
                <Text
                  fontFamily="heading"
                  fontSize="label.sm"
                  fontWeight="semibold"
                  color="content.tertiary"
                >
                  {entry.chapterTitle}
                </Text>
                <Text mt={1} fontSize="body.sm" color="content.primary">
                  {entry.finding.message}
                </Text>
              </Box>
              <HStack
                flexShrink={0}
                gap={1.5}
                color={
                  isBlocking
                    ? "sentiment.negativeDefault"
                    : "sentiment.warningDefault"
                }
              >
                <Icon as={LuCircleAlert} boxSize={3.5} />
                <Text fontSize="label.sm" fontWeight="semibold">
                  {t(isBlocking ? "review-blocking" : "review-warning")}
                </Text>
              </HStack>
            </Flex>
            {relatedChapters.length > 0 && (
              <Text mt={2} fontSize="label.sm" color="content.tertiary">
                {t("validation-related-chapters", {
                  chapters: relatedChapters.join(", "),
                })}
              </Text>
            )}
            <Text mt={2} fontSize="label.sm" color="content.secondary">
              <Text as="span" fontWeight="semibold" color="content.primary">
                {t("review-action-label")}
              </Text>{" "}
              {entry.finding.suggested_action}
            </Text>
            {isBlocking && (
              <Button
                mt={2}
                size="xs"
                variant="ghost"
                color="content.link"
                onClick={() => onOpenFinding(entry)}
              >
                {t("review-open-chapter")}
                <Icon as={LuArrowRight} />
              </Button>
            )}
          </Box>
        );
      })}
    </VStack>
  );
}

export function ReviewImpactSummary({
  blockingIssueCount,
  lng,
  status,
  warningCount,
}: {
  blockingIssueCount: number;
  lng: string;
  status: ConceptNoteChapterValidationStatus;
  warningCount: number;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const metrics = [
    {
      label: t("review-document-status"),
      value: t(statusTranslationKey(status)),
      color:
        status === "ready"
          ? "sentiment.positiveDefault"
          : status === "needs_review"
            ? "sentiment.warningDefault"
            : "sentiment.negativeDefault",
    },
    {
      label: t("review-blocking-issues-impact"),
      value: blockingIssueCount,
      color: "content.primary",
    },
    {
      label: t("review-workspace-warnings"),
      value: warningCount,
      color: "content.primary",
    },
  ];

  return (
    <Box
      aria-label={t("review-export-impact")}
      borderY="1px solid"
      borderColor="border.neutral"
      py={5}
    >
      <Text fontSize="label.sm" fontWeight="semibold" color="content.secondary">
        {t("review-export-impact")}
      </Text>
      <Grid
        mt={3}
        gap={5}
        gridTemplateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }}
      >
        {metrics.map((metric) => (
          <Box key={metric.label}>
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontWeight="semibold"
              color={metric.color}
            >
              {metric.value}
            </Text>
            <Text fontSize="label.sm" color="content.tertiary">
              {metric.label}
            </Text>
          </Box>
        ))}
      </Grid>
    </Box>
  );
}

export function SavedReviewSummary({
  failedChapters,
  lastValidatedAt,
  lng,
  onRerun,
  onRetryFailed,
  reviewedCount,
}: {
  failedChapters: FailedChapterReview[];
  lastValidatedAt: string | null;
  lng: string;
  onRerun: () => void;
  onRetryFailed: () => void;
  reviewedCount: number;
}) {
  const { t } = useTranslation(lng, "concept-notes");

  return (
    <VStack align="stretch" gap={3} mb={6}>
      <Flex
        align={{ base: "start", sm: "center" }}
        direction={{ base: "column", sm: "row" }}
        gap={3}
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="rounded"
        bg="background.neutral"
        px={4}
        py={3}
      >
        <Box flex={1}>
          <Text
            fontSize="label.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("review-saved-results")}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {lastValidatedAt
              ? t("review-saved-results-at", { date: lastValidatedAt })
              : t("review-saved-results-description")}
          </Text>
        </Box>
        <Button size="xs" variant="outline" onClick={onRerun}>
          <Icon as={LuSearchCheck} />
          {t("review-rerun")}
        </Button>
      </Flex>

      {failedChapters.length > 0 && (
        <Box
          role="alert"
          border="1px solid"
          borderColor="sentiment.negativeDefault"
          borderRadius="rounded"
          bg="sentiment.negativeOverlay"
          p={4}
        >
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("guided-review-partial-failure", {
              count: failedChapters.length,
              completed: reviewedCount,
            })}
          </Text>
          <Text mt={2} fontSize="label.sm" color="content.secondary">
            {failedChapters.map(({ chapter }) => chapter.title).join(", ")}
          </Text>
          <Button mt={4} size="xs" variant="outline" onClick={onRetryFailed}>
            {t("review-retry-failed", { count: failedChapters.length })}
          </Button>
        </Box>
      )}
    </VStack>
  );
}
