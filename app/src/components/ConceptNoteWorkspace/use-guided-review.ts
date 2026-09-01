"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/services/api";
import type {
  ConceptNoteChapterValidationStatus,
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
} from "@/util/types";

import {
  buildDocumentReviewSummary,
  type ChapterReviewErrorKind,
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

export type ReviewStage =
  "running" | "missing_information" | "conflicts_logic" | "decision" | "export";

export interface FailedChapterReview {
  chapter: ConceptNoteDraftChapter;
  errorKind: ChapterReviewErrorKind;
}

interface GuidedReviewOptions {
  draft: ConceptNoteDraftState | null;
  draftError: boolean;
  hasApplicationTemplate: boolean;
  lng: string;
  noteName: string;
  onReviewComplete: () => void | Promise<unknown>;
  open: boolean;
  runId: string;
}

const MAX_PARALLEL_CHAPTER_VALIDATIONS = 3;

export function useGuidedReview({
  draft,
  draftError,
  hasApplicationTemplate,
  lng,
  noteName,
  onReviewComplete,
  open,
  runId,
}: GuidedReviewOptions) {
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
          if (chapterIndex >= targetChapters.length) return;

          const chapter = targetChapters[chapterIndex];
          try {
            const validation = await validateChapter({
              chapterId: chapter.chapter_id,
              runId,
            }).unwrap();
            if (activeRequestRef.current !== requestId) return;
            completedByChapterId.set(chapter.chapter_id, {
              chapter,
              validation,
            });
          } catch (error) {
            if (activeRequestRef.current !== requestId) return;
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
      if (activeRequestRef.current !== requestId) return;
      try {
        await onReviewComplete();
      } catch {
        // Completed validation responses remain usable if cache refresh fails.
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
      if (draft === null && !draftError) return;
      const frame = requestAnimationFrame(() => {
        if (!wasOpenRef.current) {
          wasOpenRef.current = true;
          initializeReview();
        }
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      activeRequestRef.current += 1;
    }
  }, [draft, draftError, initializeReview, open]);

  function cancelActiveRequest(): void {
    activeRequestRef.current += 1;
    setExportingFormat(null);
  }

  function rerunReview(): void {
    void runReview({ preservedResults: [], targetChapters: chapters });
  }

  function retryFailedChapters(): void {
    void runReview({
      preservedResults: reviewedChapters,
      targetChapters: failedChapters.map(({ chapter }) => chapter),
    });
  }

  async function handleExport(format: ConceptNoteExportFormat): Promise<void> {
    if (!canExport) return;
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

  return {
    acceptedMissingInformation,
    cancelActiveRequest,
    canExport,
    chapters,
    chapterTitles,
    completedChapterCount,
    effectiveReviewStatus,
    exportError,
    exportingFormat,
    failedChapters,
    firstActionableFinding,
    firstChapterWithMissingInformation,
    handleExport,
    lastValidatedAt,
    missingInformationCount,
    progressPercent,
    rerunReview,
    retryFailedChapters,
    review,
    reviewedChapters,
    reviewError,
    setAcceptedMissingInformation,
    setStage,
    stage,
    unresolvedCount,
  };
}

export type GuidedReviewController = ReturnType<typeof useGuidedReview>;
