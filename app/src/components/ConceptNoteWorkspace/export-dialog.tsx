"use client";

import { Box, Text } from "@chakra-ui/react";

import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteDraftState } from "@/util/types";

import {
  chapterValidationFindingKey,
  type DocumentReviewFinding,
} from "./chapter-validation";
import {
  GuidedReviewDecisionPanel,
  GuidedReviewExportPanel,
  GuidedReviewFindingsPanel,
  GuidedReviewRunningPanel,
  GuidedReviewStepper,
  SavedReviewSummary,
  stageIndex,
} from "./guided-review-panels";
import { useGuidedReview } from "./use-guided-review";

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
  const controller = useGuidedReview({
    draft,
    draftError,
    hasApplicationTemplate,
    lng,
    noteName,
    onReviewComplete,
    open,
    runId,
  });

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) controller.cancelActiveRequest();
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
          <GuidedReviewStepper
            currentStepIndex={stageIndex(controller.stage)}
            lng={lng}
          />
          <Box
            flex={1}
            minW={0}
            overflowY="auto"
            px={{ base: 5, md: 8 }}
            py={6}
          >
            {controller.stage !== "running" && (
              <SavedReviewSummary
                failedChapters={controller.failedChapters}
                lastValidatedAt={controller.lastValidatedAt}
                lng={lng}
                reviewedCount={controller.reviewedChapters.length}
                onRerun={controller.rerunReview}
                onRetryFailed={controller.retryFailedChapters}
              />
            )}
            {controller.stage === "running" && (
              <GuidedReviewRunningPanel
                completedChapterCount={controller.completedChapterCount}
                draftError={draftError}
                lng={lng}
                progressPercent={controller.progressPercent}
                reviewError={controller.reviewError}
                totalChapters={controller.chapters.length}
                onCancel={() => handleOpenChange(false)}
                onRetryDraft={() => void onRetryDraft()}
                onReturnToDraft={() => handleAddInformation(null)}
                onReviewSetup={handleReviewSetup}
                rerunReview={controller.rerunReview}
              />
            )}
            {controller.stage === "missing_information" && (
              <GuidedReviewFindingsPanel
                chapterTitles={controller.chapterTitles}
                lng={lng}
                mode="missing_information"
                review={controller.review}
                onNext={() => controller.setStage("conflicts_logic")}
                onOpenFinding={handleOpenFinding}
              />
            )}
            {controller.stage === "conflicts_logic" && (
              <GuidedReviewFindingsPanel
                chapterTitles={controller.chapterTitles}
                lng={lng}
                mode="conflicts_logic"
                review={controller.review}
                onBack={() => controller.setStage("missing_information")}
                onNext={() => controller.setStage("decision")}
                onOpenFinding={handleOpenFinding}
              />
            )}
            {controller.stage === "decision" && (
              <GuidedReviewDecisionPanel
                controller={controller}
                lng={lng}
                onAddInformation={handleAddInformation}
              />
            )}
            {controller.stage === "export" && (
              <GuidedReviewExportPanel
                controller={controller}
                hasUploadedEvidence={hasUploadedEvidence}
                lng={lng}
              />
            )}
          </Box>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
