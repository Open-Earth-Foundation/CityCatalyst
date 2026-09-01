"use client";

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
  LuSearchCheck,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/i18n/client";

import {
  chapterValidationFindingKey,
  type ChapterReviewErrorKind,
  type DocumentReviewFinding,
} from "./chapter-validation";
import type { ConceptNoteExportFormat } from "./concept-note-export";
import { ReviewStageHeader } from "./guided-review-navigation";
import {
  ReviewFindingList,
  ReviewImpactSummary,
} from "./guided-review-summary";
import type { GuidedReviewController } from "./use-guided-review";

export { GuidedReviewStepper, stageIndex } from "./guided-review-navigation";
export { SavedReviewSummary } from "./guided-review-summary";

export function GuidedReviewRunningPanel({
  completedChapterCount,
  draftError,
  lng,
  onCancel,
  onRetryDraft,
  onReturnToDraft,
  onReviewSetup,
  progressPercent,
  rerunReview,
  reviewError,
  totalChapters,
}: {
  completedChapterCount: number;
  draftError: boolean;
  lng: string;
  onCancel: () => void;
  onRetryDraft: () => void;
  onReturnToDraft: () => void;
  onReviewSetup: () => void;
  progressPercent: number;
  rerunReview: () => void;
  reviewError: ChapterReviewErrorKind | null;
  totalChapters: number;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const hasError = draftError || reviewError;
  const errorTitleKey = draftError
    ? "review-draft-load-error"
    : reviewError === "template_unavailable"
      ? "guided-review-template-unavailable"
      : reviewError === "draft_unavailable"
        ? "guided-review-draft-unavailable"
        : "guided-review-failed";
  const errorDescriptionKey = draftError
    ? "review-draft-load-error-description"
    : reviewError === "template_unavailable"
      ? "guided-review-template-unavailable-description"
      : reviewError === "draft_unavailable"
        ? "guided-review-draft-unavailable-description"
        : "guided-review-failed-description";

  return (
    <Flex h="full" minH="440px" align="center" justify="center">
      <VStack maxW="420px" gap={5} textAlign="center">
        {hasError ? (
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
                {t(errorTitleKey)}
              </Text>
              <Text mt={2} fontSize="body.sm" color="content.secondary">
                {t(errorDescriptionKey)}
              </Text>
            </Box>
            <HStack gap={3}>
              <Button variant="outline" onClick={onCancel}>
                {t("cancel")}
              </Button>
              {draftError ? (
                <Button onClick={onRetryDraft}>{t("try-again")}</Button>
              ) : reviewError === "template_unavailable" ? (
                <Button onClick={onReviewSetup}>
                  {t("review-application-setup")}
                </Button>
              ) : reviewError === "draft_unavailable" ? (
                <Button onClick={onReturnToDraft}>
                  {t("review-return-to-draft")}
                </Button>
              ) : (
                <Button onClick={rerunReview}>{t("try-again")}</Button>
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
              <Spinner position="absolute" boxSize="64px" borderWidth="2px" />
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
              <Text mt={2} fontSize="body.sm" color="content.secondary">
                {t("guided-review-progress", {
                  current: completedChapterCount,
                  total: totalChapters,
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
              <Text mt={3} fontSize="label.sm" color="content.tertiary">
                {t("guided-review-running-description")}
              </Text>
            </Box>
          </>
        )}
      </VStack>
    </Flex>
  );
}

export function GuidedReviewFindingsPanel({
  chapterTitles,
  lng,
  mode,
  onBack,
  onNext,
  onOpenFinding,
  review,
}: {
  chapterTitles: Record<string, string>;
  lng: string;
  mode: "missing_information" | "conflicts_logic";
  onBack?: () => void;
  onNext: () => void;
  onOpenFinding: (entry: DocumentReviewFinding) => void;
  review: GuidedReviewController["review"];
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const isMissing = mode === "missing_information";
  const entries = isMissing
    ? review.groups.missing_information
    : review.groups.conflicts_logic;

  return (
    <VStack align="stretch" gap={6}>
      <ReviewStageHeader
        description={t(
          isMissing
            ? "review-missing-description"
            : "review-conflicts-description",
          { count: entries.length },
        )}
        lng={lng}
        step={isMissing ? 1 : 2}
        title={t(isMissing ? "review-missing-title" : "review-conflicts-title")}
      />
      {isMissing && review.templateFailureCount > 0 && (
        <HStack gap={2} color="sentiment.warningDefault">
          <Icon as={LuCircleAlert} />
          <Text fontSize="label.sm">
            {t("review-template-failures", {
              count: review.templateFailureCount,
            })}
          </Text>
        </HStack>
      )}
      <ReviewFindingList
        chapterTitles={chapterTitles}
        emptyKey={
          isMissing ? "review-no-missing-information" : "review-no-conflicts"
        }
        entries={entries}
        lng={lng}
        onOpenFinding={onOpenFinding}
      />
      {isMissing && (
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
            {t("review-evidence-description", { count: review.evidenceCount })}
          </Text>
          <ReviewFindingList
            chapterTitles={chapterTitles}
            emptyKey="review-no-evidence-warnings"
            entries={review.groups.evidence}
            lng={lng}
            onOpenFinding={onOpenFinding}
          />
        </Box>
      )}
      <Flex justify={onBack ? "space-between" : "flex-end"} gap={3} pt={2}>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <Icon as={LuArrowLeft} />
            {t("review-back-missing")}
          </Button>
        )}
        <Button onClick={onNext}>
          {t(isMissing ? "review-next-conflicts" : "review-next-decision")}
          <Icon as={LuArrowRight} />
        </Button>
      </Flex>
    </VStack>
  );
}

export function GuidedReviewDecisionPanel({
  controller,
  lng,
  onAddInformation,
}: {
  controller: GuidedReviewController;
  lng: string;
  onAddInformation: (
    chapterId: string | null,
    findingKey?: string | null,
  ) => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const {
    effectiveReviewStatus,
    firstActionableFinding,
    firstChapterWithMissingInformation,
    missingInformationCount,
    review,
    setStage,
  } = controller;

  return (
    <VStack align="stretch" gap={6}>
      <ReviewStageHeader
        description={t("review-decision-description")}
        lng={lng}
        step={3}
        title={t("review-decision-title")}
      />
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
              onAddInformation(
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
            {t("review-review-warnings", { count: review.warningCount })}
          </Button>
        )}
        <Button
          justifyContent="flex-start"
          variant={effectiveReviewStatus === "ready" ? "solid" : "ghost"}
          color={
            effectiveReviewStatus === "ready" ? "base.light" : "content.link"
          }
          onClick={() => setStage("export")}
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
    </VStack>
  );
}

const exportFormats: Array<{
  descriptionKey: string;
  format: ConceptNoteExportFormat;
  label: string;
}> = [
  { format: "docx", label: "DOCX", descriptionKey: "docx-description" },
  { format: "pdf", label: "PDF", descriptionKey: "pdf-description" },
];

export function GuidedReviewExportPanel({
  controller,
  hasUploadedEvidence,
  lng,
}: {
  controller: GuidedReviewController;
  hasUploadedEvidence: boolean;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const {
    acceptedMissingInformation,
    canExport,
    effectiveReviewStatus,
    exportError,
    exportingFormat,
    handleExport,
    missingInformationCount,
    review,
    setAcceptedMissingInformation,
    setStage,
    unresolvedCount,
  } = controller;

  return (
    <VStack align="stretch" gap={6}>
      <ReviewStageHeader
        description={t("review-export-description")}
        lng={lng}
        step={3}
        title={t("review-export-title")}
      />
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
            setAcceptedMissingInformation(details.checked === true)
          }
        >
          <Text fontSize="body.sm" lineHeight="22px" color="content.primary">
            {t("missing-information-export-confirmation", {
              count: unresolvedCount,
            })}
          </Text>
        </Checkbox>
      )}
      <Grid gap={3} gridTemplateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }}>
        {exportFormats.map((item) => (
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
                {t(item.descriptionKey)}
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
        <HStack role="alert" gap={2} color="sentiment.negativeDefault">
          <Icon as={LuCircleAlert} />
          <Text fontSize="label.sm">{t("export-failed")}</Text>
        </HStack>
      )}
      <Button
        alignSelf="flex-start"
        variant="ghost"
        onClick={() => setStage("decision")}
      >
        <Icon as={LuArrowLeft} />
        {t("review-back-decision")}
      </Button>
    </VStack>
  );
}
