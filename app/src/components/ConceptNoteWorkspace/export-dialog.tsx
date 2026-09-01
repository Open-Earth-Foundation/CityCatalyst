"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Box,
  Flex,
  Grid,
  HStack,
  Icon,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuCircleAlert,
  LuDownload,
  LuFileText,
  LuListChecks,
  LuSearchCheck,
  LuShieldCheck,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type {
  ConceptNoteChapterValidationStatus,
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
} from "@/util/types";

import {
  buildDocumentReviewSummary,
  chapterValidationFindingKey,
  type ChapterReviewErrorKind,
  type DocumentReviewFinding,
  getChapterReviewErrorKind,
  isChapterValidationCurrent,
  type ReviewedConceptNoteChapter,
} from "./chapter-validation";
import {
  canExportConceptNote,
  countUnresolvedExportItems,
  exportConceptNote,
  type ConceptNoteExportFormat,
} from "./concept-note-export";

type ReviewStage =
  "running" | "missing_information" | "conflicts_logic" | "decision";

const MAX_PARALLEL_CHAPTER_VALIDATIONS = 3;

interface ExportDialogProps {
  draft: ConceptNoteDraftState | null;
  draftError: boolean;
  hasApplicationTemplate: boolean;
  hasUploadedEvidence: boolean;
  lng: string;
  noteName: string;
  onAddInformation: (
    chapterId: string | null,
    findingKey?: string | null,
  ) => void;
  onOpenChange: (open: boolean) => void;
  onRetryDraft: () => void | Promise<unknown>;
  onReviewComplete: () => void | Promise<unknown>;
  onReviewSetup: () => void;
  open: boolean;
  runId: string;
}

interface ReviewFindingListProps {
  chapterTitles: Record<string, string>;
  emptyKey: string;
  entries: DocumentReviewFinding[];
  lng: string;
  onOpenFinding: (entry: DocumentReviewFinding) => void;
}

interface ReviewImpactSummaryProps {
  lng: string;
  missingInformationCount: number;
  status: ConceptNoteChapterValidationStatus;
  warningCount: number;
}

interface FailedChapterReview {
  chapter: ConceptNoteDraftChapter;
  errorKind: ChapterReviewErrorKind;
}

const reviewSteps: Array<{
  icon: typeof LuListChecks;
  key: Exclude<ReviewStage, "running">;
  labelKey: string;
}> = [
  {
    key: "missing_information",
    labelKey: "review-step-missing-information",
    icon: LuListChecks,
  },
  {
    key: "conflicts_logic",
    labelKey: "review-step-conflicts-logic",
    icon: LuSearchCheck,
  },
  {
    key: "decision",
    labelKey: "review-step-decision",
    icon: LuShieldCheck,
  },
];

function stageIndex(stage: ReviewStage): number {
  return stage === "running"
    ? -1
    : reviewSteps.findIndex((step) => step.key === stage);
}

function statusTranslationKey(
  status: ConceptNoteChapterValidationStatus,
): string {
  if (status === "ready") {
    return "validation-status-ready";
  }
  if (status === "needs_review") {
    return "validation-status-needs-review";
  }
  return "validation-status-incomplete";
}

function chapterFailureDescriptionKey(
  errorKind: ChapterReviewErrorKind,
): string {
  if (errorKind === "template_unavailable") {
    return "guided-review-chapter-failed-template";
  }
  if (errorKind === "service_unavailable") {
    return "guided-review-chapter-failed-service";
  }
  return "guided-review-chapter-failed-generic";
}

function ReviewFindingList({
  chapterTitles,
  emptyKey,
  entries,
  lng,
  onOpenFinding,
}: ReviewFindingListProps) {
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

function ReviewImpactSummary({
  lng,
  missingInformationCount,
  status,
  warningCount,
}: ReviewImpactSummaryProps) {
  const { t } = useTranslation(lng, "concept-notes");

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
        gridTemplateColumns={{
          base: "1fr",
          sm: "repeat(3, 1fr)",
        }}
      >
        <Box>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("review-document-status")}
          </Text>
          <Text
            mt={1}
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color={
              status === "ready"
                ? "sentiment.positiveDefault"
                : status === "needs_review"
                  ? "sentiment.warningDefault"
                  : "sentiment.negativeDefault"
            }
          >
            {t(statusTranslationKey(status))}
          </Text>
        </Box>
        <Box>
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.primary"
          >
            {missingInformationCount}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("review-missing-information-impact")}
          </Text>
        </Box>
        <Box>
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.primary"
          >
            {warningCount}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("review-workspace-warnings")}
          </Text>
        </Box>
      </Grid>
    </Box>
  );
}

export function ExportDialog({
  draft,
  draftError,
  hasApplicationTemplate,
  hasUploadedEvidence,
  lng,
  noteName,
  onAddInformation,
  onOpenChange,
  onRetryDraft,
  onReviewComplete,
  onReviewSetup,
  open,
  runId,
}: ExportDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [validateChapter] = api.useValidateConceptNoteChapterMutation();
  const chapters = useMemo(() => draft?.chapters ?? [], [draft?.chapters]);
  const chapterTitles = useMemo(
    () =>
      Object.fromEntries(
        chapters.map((chapter) => [chapter.chapter_id, chapter.title]),
      ),
    [chapters],
  );
  const [stage, setStage] = useState<ReviewStage>("running");
  const [reviewedChapters, setReviewedChapters] = useState<
    ReviewedConceptNoteChapter[]
  >([]);
  const [reviewError, setReviewError] = useState<ChapterReviewErrorKind | null>(
    null,
  );
  const [failedChapters, setFailedChapters] = useState<FailedChapterReview[]>(
    [],
  );
  const [completedChapterCount, setCompletedChapterCount] = useState(0);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [acceptedMissingInformation, setAcceptedMissingInformation] =
    useState(false);
  const [exportError, setExportError] = useState(false);
  const [exportingFormat, setExportingFormat] =
    useState<ConceptNoteExportFormat | null>(null);
  const activeRequestRef = useRef(0);
  const wasOpenRef = useRef(false);

  const review = useMemo(
    () => buildDocumentReviewSummary(reviewedChapters),
    [reviewedChapters],
  );
  const unresolvedCount = useMemo(
    () => countUnresolvedExportItems(chapters),
    [chapters],
  );
  const missingInformationCount = Math.max(
    review.blockingCount,
    unresolvedCount,
  );
  const firstChapterWithMissingInformation =
    chapters.find((chapter) => chapter.missing_information.length > 0) ?? null;
  const canExport =
    canExportConceptNote(chapters, acceptedMissingInformation) &&
    !exportingFormat;
  const progressPercent = chapters.length
    ? Math.round((completedChapterCount / chapters.length) * 100)
    : 0;
  const reviewFindings = [
    ...review.groups.missing_information,
    ...review.groups.conflicts_logic,
    ...review.groups.evidence,
  ];
  const firstActionableFinding =
    reviewFindings.find(({ finding }) => finding.severity === "blocking") ??
    reviewFindings[0] ??
    null;
  const effectiveReviewStatus: ConceptNoteChapterValidationStatus =
    failedChapters.length > 0 || reviewedChapters.length < chapters.length
      ? "incomplete"
      : review.status === "ready" && unresolvedCount > 0
        ? "incomplete"
        : review.status;
  const lastValidatedAt = useMemo(() => {
    const timestamps = reviewedChapters
      .map(({ validation }) => validation.validated_at)
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .filter(Number.isFinite);
    return timestamps.length > 0
      ? new Intl.DateTimeFormat(lng, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(Math.max(...timestamps))
      : null;
  }, [lng, reviewedChapters]);

  const runReview = useCallback(
    async ({
      preservedResults,
      targetChapters,
    }: {
      preservedResults: ReviewedConceptNoteChapter[];
      targetChapters: ConceptNoteDraftChapter[];
    }) => {
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;
      setStage("running");
      setReviewedChapters(preservedResults);
      setFailedChapters([]);
      setReviewError(null);
      setCompletedChapterCount(preservedResults.length);
      setShowExportOptions(false);
      setAcceptedMissingInformation(false);
      setExportError(false);

      const completedByChapterId = new Map(
        preservedResults.map((result) => [result.chapter.chapter_id, result]),
      );
      let nextChapterIndex = 0;
      let completedCount = preservedResults.length;
      const failures: FailedChapterReview[] = [];

      function publishResults(): void {
        setReviewedChapters(
          chapters.flatMap((chapter) => {
            const result = completedByChapterId.get(chapter.chapter_id);
            return result ? [result] : [];
          }),
        );
        setFailedChapters([...failures]);
        setCompletedChapterCount(completedCount);
      }

      async function validateNextChapters(): Promise<void> {
        while (activeRequestRef.current === requestId) {
          const chapterIndex = nextChapterIndex;
          nextChapterIndex += 1;
          if (chapterIndex >= targetChapters.length) {
            return;
          }

          const chapter = targetChapters[chapterIndex];
          try {
            const validation = await validateChapter({
              chapterId: chapter.chapter_id,
              runId,
            }).unwrap();
            if (activeRequestRef.current !== requestId) {
              return;
            }
            completedByChapterId.set(chapter.chapter_id, {
              chapter,
              validation,
            });
          } catch (error) {
            if (activeRequestRef.current !== requestId) {
              return;
            }
            failures.push({
              chapter,
              errorKind: getChapterReviewErrorKind(error),
            });
          }

          completedCount += 1;
          publishResults();
        }
      }

      const workerCount = Math.min(
        MAX_PARALLEL_CHAPTER_VALIDATIONS,
        targetChapters.length,
      );
      await Promise.all(
        Array.from({ length: workerCount }, () => validateNextChapters()),
      );
      if (activeRequestRef.current !== requestId) {
        return;
      }
      try {
        await onReviewComplete();
      } catch {
        // The completed validation responses remain usable if cache refresh fails.
      } finally {
        if (activeRequestRef.current === requestId) {
          setStage("missing_information");
        }
      }
    },
    [chapters, onReviewComplete, runId, validateChapter],
  );

  const initializeReview = useCallback(() => {
    activeRequestRef.current += 1;
    setStage("running");
    setReviewedChapters([]);
    setFailedChapters([]);
    setReviewError(null);
    setCompletedChapterCount(0);
    setShowExportOptions(false);
    setAcceptedMissingInformation(false);
    setExportError(false);

    if (!hasApplicationTemplate) {
      setReviewError("template_unavailable");
      return;
    }
    if (chapters.length === 0) {
      setReviewError("draft_unavailable");
      return;
    }

    const preservedResults = chapters.flatMap((chapter) =>
      chapter.validation && isChapterValidationCurrent(chapter)
        ? [{ chapter, validation: chapter.validation }]
        : [],
    );
    const preservedChapterIds = new Set(
      preservedResults.map(({ chapter }) => chapter.chapter_id),
    );
    const targetChapters = chapters.filter(
      (chapter) => !preservedChapterIds.has(chapter.chapter_id),
    );

    if (targetChapters.length === 0) {
      setReviewedChapters(preservedResults);
      setCompletedChapterCount(chapters.length);
      setStage("missing_information");
      return;
    }
    void runReview({ preservedResults, targetChapters });
  }, [chapters, hasApplicationTemplate, runReview]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      if (draft === null && !draftError) {
        return;
      }
      const frame = requestAnimationFrame(() => {
        if (!wasOpenRef.current) {
          wasOpenRef.current = true;
          initializeReview();
        }
      });
      return () => cancelAnimationFrame(frame);
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      activeRequestRef.current += 1;
    }
  }, [draft, draftError, initializeReview, open]);

  function rerunReview(): void {
    void runReview({ preservedResults: [], targetChapters: chapters });
  }

  function retryFailedChapters(): void {
    void runReview({
      preservedResults: reviewedChapters,
      targetChapters: failedChapters.map(({ chapter }) => chapter),
    });
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      activeRequestRef.current += 1;
      setExportingFormat(null);
    }
    onOpenChange(nextOpen);
  }

  function handleAddInformation(
    chapterId: string | null,
    findingKey?: string | null,
  ): void {
    handleOpenChange(false);
    onAddInformation(chapterId, findingKey);
  }

  function handleOpenFinding(entry: DocumentReviewFinding): void {
    handleAddInformation(
      entry.chapterId,
      chapterValidationFindingKey(entry.chapterId, entry.finding),
    );
  }

  function handleReviewSetup(): void {
    handleOpenChange(false);
    onReviewSetup();
  }

  async function handleExport(format: ConceptNoteExportFormat): Promise<void> {
    if (!canExport) {
      return;
    }
    setExportError(false);
    setExportingFormat(format);
    try {
      await exportConceptNote(format, noteName, chapters, lng);
    } catch {
      setExportError(true);
    } finally {
      setExportingFormat(null);
    }
  }

  const currentStepIndex = stageIndex(stage);

  return (
    <DialogRoot
      open={open}
      onOpenChange={(details) => handleOpenChange(details.open)}
      size="cover"
    >
      <DialogContent
        w="calc(100vw - 32px)"
        maxW="980px"
        h="min(820px, calc(100dvh - 32px))"
        my={4}
        overflow="hidden"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader
          display="block"
          flexShrink={0}
          borderBottom="1px solid"
          borderColor="border.neutral"
          px={{ base: 5, md: 7 }}
          py={5}
          pe={14}
        >
          <DialogTitle
            fontFamily="heading"
            fontSize="title.lg"
            color="content.primary"
          >
            {t("guided-review-title")}
          </DialogTitle>
          <Text mt={1} fontSize="body.sm" color="content.tertiary">
            {t("guided-review-description")}
          </Text>
        </DialogHeader>
        <DialogCloseTrigger aria-label={t("close")} />

        <DialogBody display="flex" minH={0} overflow="hidden" p={0}>
          <VStack
            display={{ base: "none", md: "flex" }}
            w="230px"
            flexShrink={0}
            align="stretch"
            gap={1}
            borderRight="1px solid"
            borderColor="border.neutral"
            bg="background.neutral"
            px={4}
            py={6}
          >
            <Text
              mb={3}
              px={3}
              fontFamily="heading"
              fontSize="overline"
              fontWeight="semibold"
              letterSpacing="widest"
              color="content.tertiary"
              textTransform="uppercase"
            >
              {t("guided-review-steps")}
            </Text>
            {reviewSteps.map((step, index) => {
              const isActive = currentStepIndex === index;
              const isComplete = currentStepIndex > index;
              return (
                <HStack
                  key={step.key}
                  aria-current={isActive ? "step" : undefined}
                  gap={3}
                  borderRadius="rounded"
                  bg={isActive ? "base.light" : "transparent"}
                  color={
                    isActive || isComplete
                      ? "content.primary"
                      : "content.tertiary"
                  }
                  px={3}
                  py={3}
                  boxShadow={isActive ? "1dp" : "none"}
                >
                  <Flex
                    boxSize="28px"
                    align="center"
                    justify="center"
                    flexShrink={0}
                    borderRadius="full"
                    bg={
                      isComplete
                        ? "sentiment.positiveDefault"
                        : isActive
                          ? "content.link"
                          : "background.alternativeLight"
                    }
                    color={isActive || isComplete ? "base.light" : "inherit"}
                  >
                    <Icon as={isComplete ? LuCheck : step.icon} boxSize={3.5} />
                  </Flex>
                  <Box>
                    <Text fontSize="label.sm" color="content.tertiary">
                      {t("review-step-number", { number: index + 1 })}
                    </Text>
                    <Text fontSize="body.sm" fontWeight="semibold">
                      {t(step.labelKey)}
                    </Text>
                  </Box>
                </HStack>
              );
            })}
          </VStack>

          <Box
            flex={1}
            minW={0}
            overflowY="auto"
            px={{ base: 5, md: 8 }}
            py={6}
          >
            {stage !== "running" && (
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
                        ? t("review-saved-results-at", {
                            date: lastValidatedAt,
                          })
                        : t("review-saved-results-description")}
                    </Text>
                  </Box>
                  <Button size="xs" variant="outline" onClick={rerunReview}>
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
                        completed: reviewedChapters.length,
                      })}
                    </Text>
                    <VStack align="stretch" gap={2} mt={3}>
                      {failedChapters.map(({ chapter, errorKind }) => (
                        <Box key={chapter.chapter_id}>
                          <Text
                            fontSize="label.sm"
                            fontWeight="semibold"
                            color="content.primary"
                          >
                            {chapter.title}
                          </Text>
                          <Text fontSize="label.sm" color="content.secondary">
                            {t(chapterFailureDescriptionKey(errorKind))}
                          </Text>
                        </Box>
                      ))}
                    </VStack>
                    <Button
                      mt={4}
                      size="xs"
                      variant="outline"
                      onClick={retryFailedChapters}
                    >
                      {t("review-retry-failed", {
                        count: failedChapters.length,
                      })}
                    </Button>
                  </Box>
                )}
              </VStack>
            )}

            {stage === "running" && (
              <Flex h="full" minH="440px" align="center" justify="center">
                <VStack maxW="420px" gap={5} textAlign="center">
                  {draftError || reviewError ? (
                    <>
                      <Flex
                        boxSize="56px"
                        align="center"
                        justify="center"
                        borderRadius="full"
                        bg="sentiment.negativeOverlay"
                        color="sentiment.negativeDefault"
                      >
                        <Icon as={LuCircleAlert} boxSize={6} />
                      </Flex>
                      <Box role="alert">
                        <Text
                          as="h2"
                          fontFamily="heading"
                          fontSize="title.md"
                          fontWeight="semibold"
                          color="content.primary"
                        >
                          {t(
                            draftError
                              ? "review-draft-load-error"
                              : reviewError === "template_unavailable"
                                ? "guided-review-template-unavailable"
                                : reviewError === "draft_unavailable"
                                  ? "guided-review-draft-unavailable"
                                  : "guided-review-failed",
                          )}
                        </Text>
                        <Text
                          mt={2}
                          fontSize="body.sm"
                          color="content.secondary"
                        >
                          {t(
                            draftError
                              ? "review-draft-load-error-description"
                              : reviewError === "template_unavailable"
                                ? "guided-review-template-unavailable-description"
                                : reviewError === "draft_unavailable"
                                  ? "guided-review-draft-unavailable-description"
                                  : "guided-review-failed-description",
                          )}
                        </Text>
                      </Box>
                      <HStack gap={3}>
                        <Button
                          variant="outline"
                          onClick={() => handleOpenChange(false)}
                        >
                          {t("cancel")}
                        </Button>
                        {draftError ? (
                          <Button onClick={() => void onRetryDraft()}>
                            {t("try-again")}
                          </Button>
                        ) : reviewError === "template_unavailable" ? (
                          <Button onClick={handleReviewSetup}>
                            {t("review-application-setup")}
                          </Button>
                        ) : reviewError === "draft_unavailable" ? (
                          <Button onClick={() => handleAddInformation(null)}>
                            {t("review-return-to-draft")}
                          </Button>
                        ) : (
                          <Button onClick={rerunReview}>
                            {t("try-again")}
                          </Button>
                        )}
                      </HStack>
                    </>
                  ) : (
                    <>
                      <Flex
                        boxSize="64px"
                        align="center"
                        justify="center"
                        position="relative"
                        borderRadius="full"
                        bg="background.neutral"
                        color="content.link"
                      >
                        <Spinner
                          position="absolute"
                          boxSize="64px"
                          borderWidth="2px"
                        />
                        <Icon as={LuSearchCheck} boxSize={6} />
                      </Flex>
                      <Box aria-live="polite">
                        <Text
                          as="h2"
                          fontFamily="heading"
                          fontSize="title.md"
                          fontWeight="semibold"
                          color="content.primary"
                        >
                          {t("guided-review-running")}
                        </Text>
                        <Text
                          mt={2}
                          fontSize="body.sm"
                          color="content.secondary"
                        >
                          {t("guided-review-progress", {
                            current: completedChapterCount,
                            total: chapters.length,
                          })}
                        </Text>
                      </Box>
                      <Box w="full" maxW="340px">
                        <Box
                          h="6px"
                          overflow="hidden"
                          borderRadius="full"
                          bg="background.neutral"
                        >
                          <Box
                            h="full"
                            w={`${progressPercent}%`}
                            borderRadius="full"
                            bg="content.link"
                            transition="width 180ms ease-out"
                          />
                        </Box>
                        <Text
                          mt={3}
                          fontSize="label.sm"
                          color="content.tertiary"
                        >
                          {t("guided-review-running-description")}
                        </Text>
                      </Box>
                    </>
                  )}
                </VStack>
              </Flex>
            )}

            {stage === "missing_information" && (
              <VStack align="stretch" gap={6}>
                <Box>
                  <Text
                    fontSize="label.sm"
                    fontWeight="semibold"
                    color="content.link"
                  >
                    {t("review-step-number", { number: 1 })}
                  </Text>
                  <Text
                    as="h2"
                    mt={1}
                    fontFamily="heading"
                    fontSize="title.lg"
                    fontWeight="semibold"
                    color="content.primary"
                  >
                    {t("review-missing-title")}
                  </Text>
                  <Text
                    mt={2}
                    maxW="640px"
                    fontSize="body.sm"
                    color="content.secondary"
                  >
                    {t("review-missing-description", {
                      count: review.groups.missing_information.length,
                    })}
                  </Text>
                  {review.templateFailureCount > 0 && (
                    <HStack mt={4} gap={2} color="sentiment.warningDefault">
                      <Icon as={LuCircleAlert} />
                      <Text fontSize="label.sm">
                        {t("review-template-failures", {
                          count: review.templateFailureCount,
                        })}
                      </Text>
                    </HStack>
                  )}
                </Box>

                <ReviewFindingList
                  chapterTitles={chapterTitles}
                  emptyKey="review-no-missing-information"
                  entries={review.groups.missing_information}
                  lng={lng}
                  onOpenFinding={handleOpenFinding}
                />

                <Box borderTop="1px solid" borderColor="border.neutral" pt={5}>
                  <Text
                    as="h3"
                    fontFamily="heading"
                    fontSize="body.md"
                    fontWeight="semibold"
                    color="content.primary"
                  >
                    {t("review-evidence-title")}
                  </Text>
                  <Text mt={1} fontSize="body.sm" color="content.secondary">
                    {t("review-evidence-description", {
                      count: review.evidenceCount,
                    })}
                  </Text>
                  <ReviewFindingList
                    chapterTitles={chapterTitles}
                    emptyKey="review-no-evidence-warnings"
                    entries={review.groups.evidence}
                    lng={lng}
                    onOpenFinding={handleOpenFinding}
                  />
                </Box>

                <Flex justify="flex-end" pt={2}>
                  <Button onClick={() => setStage("conflicts_logic")}>
                    {t("review-next-conflicts")}
                    <Icon as={LuArrowRight} />
                  </Button>
                </Flex>
              </VStack>
            )}

            {stage === "conflicts_logic" && (
              <VStack align="stretch" gap={6}>
                <Box>
                  <Text
                    fontSize="label.sm"
                    fontWeight="semibold"
                    color="content.link"
                  >
                    {t("review-step-number", { number: 2 })}
                  </Text>
                  <Text
                    as="h2"
                    mt={1}
                    fontFamily="heading"
                    fontSize="title.lg"
                    fontWeight="semibold"
                    color="content.primary"
                  >
                    {t("review-conflicts-title")}
                  </Text>
                  <Text
                    mt={2}
                    maxW="640px"
                    fontSize="body.sm"
                    color="content.secondary"
                  >
                    {t("review-conflicts-description", {
                      count: review.groups.conflicts_logic.length,
                    })}
                  </Text>
                </Box>

                <ReviewFindingList
                  chapterTitles={chapterTitles}
                  emptyKey="review-no-conflicts"
                  entries={review.groups.conflicts_logic}
                  lng={lng}
                  onOpenFinding={handleOpenFinding}
                />

                <Flex justify="space-between" gap={3} pt={2}>
                  <Button
                    variant="ghost"
                    onClick={() => setStage("missing_information")}
                  >
                    <Icon as={LuArrowLeft} />
                    {t("review-back-missing")}
                  </Button>
                  <Button onClick={() => setStage("decision")}>
                    {t("review-next-decision")}
                    <Icon as={LuArrowRight} />
                  </Button>
                </Flex>
              </VStack>
            )}

            {stage === "decision" && (
              <VStack align="stretch" gap={6}>
                {!showExportOptions ? (
                  <>
                    <Box>
                      <Text
                        fontSize="label.sm"
                        fontWeight="semibold"
                        color="content.link"
                      >
                        {t("review-step-number", { number: 3 })}
                      </Text>
                      <Text
                        as="h2"
                        mt={1}
                        fontFamily="heading"
                        fontSize="title.lg"
                        fontWeight="semibold"
                        color="content.primary"
                      >
                        {t("review-decision-title")}
                      </Text>
                      <Text
                        mt={2}
                        maxW="640px"
                        fontSize="body.sm"
                        color="content.secondary"
                      >
                        {t("review-decision-description")}
                      </Text>
                    </Box>

                    <ReviewImpactSummary
                      lng={lng}
                      missingInformationCount={missingInformationCount}
                      status={effectiveReviewStatus}
                      warningCount={review.warningCount}
                    />

                    <VStack align="stretch" gap={3}>
                      {missingInformationCount > 0 && (
                        <Button
                          justifyContent="flex-start"
                          onClick={() =>
                            handleAddInformation(
                              firstActionableFinding?.chapterId ??
                                firstChapterWithMissingInformation?.chapter_id ??
                                null,
                              firstActionableFinding
                                ? chapterValidationFindingKey(
                                    firstActionableFinding.chapterId,
                                    firstActionableFinding.finding,
                                  )
                                : null,
                            )
                          }
                        >
                          <Icon as={LuFileText} />
                          {t("review-fix-missing-information")}
                        </Button>
                      )}
                      {review.warningCount > 0 && (
                        <Button
                          justifyContent="flex-start"
                          variant="outline"
                          onClick={() => setStage("missing_information")}
                        >
                          <Icon as={LuSearchCheck} />
                          {t("review-review-warnings", {
                            count: review.warningCount,
                          })}
                        </Button>
                      )}
                      <Button
                        justifyContent="flex-start"
                        variant={
                          effectiveReviewStatus === "ready" ? "solid" : "ghost"
                        }
                        color={
                          effectiveReviewStatus === "ready"
                            ? "base.light"
                            : "content.link"
                        }
                        onClick={() => setShowExportOptions(true)}
                      >
                        <Icon as={LuDownload} />
                        {t(
                          effectiveReviewStatus === "ready"
                            ? "review-continue-export"
                            : "review-export-as-is",
                        )}
                      </Button>
                    </VStack>

                    <Button
                      alignSelf="flex-start"
                      variant="ghost"
                      onClick={() => setStage("conflicts_logic")}
                    >
                      <Icon as={LuArrowLeft} />
                      {t("review-back-conflicts")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Box>
                      <Text
                        fontSize="label.sm"
                        fontWeight="semibold"
                        color="content.link"
                      >
                        {t("review-step-number", { number: 3 })}
                      </Text>
                      <Text
                        as="h2"
                        mt={1}
                        fontFamily="heading"
                        fontSize="title.lg"
                        fontWeight="semibold"
                        color="content.primary"
                      >
                        {t("review-export-title")}
                      </Text>
                      <Text mt={2} fontSize="body.sm" color="content.secondary">
                        {t("review-export-description")}
                      </Text>
                    </Box>

                    <HStack
                      align="start"
                      gap={3}
                      borderY="1px solid"
                      borderColor="border.neutral"
                      py={4}
                    >
                      <Icon
                        as={hasUploadedEvidence ? LuCheck : LuCircleAlert}
                        mt={0.5}
                        color={
                          hasUploadedEvidence
                            ? "sentiment.positiveDefault"
                            : "sentiment.warningDefault"
                        }
                      />
                      <Box>
                        <Text
                          fontSize="body.sm"
                          fontWeight="semibold"
                          color="content.primary"
                        >
                          {t(
                            hasUploadedEvidence
                              ? "source-context-ready"
                              : "source-context-recommended",
                          )}
                        </Text>
                        <Text fontSize="label.sm" color="content.secondary">
                          {t(
                            hasUploadedEvidence
                              ? "source-context-ready-export"
                              : "source-context-recommended-export",
                          )}
                        </Text>
                      </Box>
                    </HStack>

                    <ReviewImpactSummary
                      lng={lng}
                      missingInformationCount={missingInformationCount}
                      status={effectiveReviewStatus}
                      warningCount={review.warningCount}
                    />

                    {unresolvedCount > 0 && (
                      <Checkbox
                        alignItems="start"
                        checked={acceptedMissingInformation}
                        onCheckedChange={(details) =>
                          setAcceptedMissingInformation(
                            details.checked === true,
                          )
                        }
                      >
                        <Text
                          fontSize="body.sm"
                          lineHeight="22px"
                          color="content.primary"
                        >
                          {t("missing-information-export-confirmation", {
                            count: unresolvedCount,
                          })}
                        </Text>
                      </Checkbox>
                    )}

                    <Grid
                      gap={3}
                      gridTemplateColumns={{
                        base: "1fr",
                        sm: "repeat(2, 1fr)",
                      }}
                    >
                      {(
                        [
                          {
                            format: "docx",
                            label: "DOCX",
                            description: t("docx-description"),
                          },
                          {
                            format: "pdf",
                            label: "PDF",
                            description: t("pdf-description"),
                          },
                        ] satisfies Array<{
                          description: string;
                          format: ConceptNoteExportFormat;
                          label: string;
                        }>
                      ).map((item) => (
                        <VStack
                          key={item.format}
                          align="stretch"
                          gap={3}
                          border="1px solid"
                          borderColor="border.neutral"
                          borderRadius="rounded"
                          p={4}
                        >
                          <Box>
                            <Text
                              fontFamily="heading"
                              fontWeight="semibold"
                              color="content.primary"
                            >
                              {item.label}
                            </Text>
                            <Text fontSize="label.sm" color="content.tertiary">
                              {item.description}
                            </Text>
                          </Box>
                          <Button
                            disabled={!canExport}
                            loading={exportingFormat === item.format}
                            variant="outline"
                            onClick={() => void handleExport(item.format)}
                          >
                            <Icon as={LuDownload} />
                            {t("export-format", { format: item.label })}
                          </Button>
                        </VStack>
                      ))}
                    </Grid>

                    {exportError && (
                      <HStack
                        role="alert"
                        gap={2}
                        color="sentiment.negativeDefault"
                      >
                        <Icon as={LuCircleAlert} />
                        <Text fontSize="label.sm">{t("export-failed")}</Text>
                      </HStack>
                    )}

                    <Button
                      alignSelf="flex-start"
                      variant="ghost"
                      onClick={() => setShowExportOptions(false)}
                    >
                      <Icon as={LuArrowLeft} />
                      {t("review-back-decision")}
                    </Button>
                  </>
                )}
              </VStack>
            )}
          </Box>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
