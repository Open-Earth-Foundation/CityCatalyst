"use client";

import {
  Box,
  chakra,
  Flex,
  HStack,
  Icon,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { EditChange } from "@/util/concept-note-edit-types";
import { InlineDocumentDiff } from "./edit-diff";
import { snapshotChanges, type InlineReviewDecision } from "./inline-review";
import type { IconType } from "react-icons";
import {
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuDatabase,
  LuRefreshCw,
  LuSparkles,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftChapter,
  ConceptNoteDraftChapterStatus,
  ConceptNoteDraftRunStatus,
  ConceptNoteDraftState,
  ConceptNoteGap,
} from "@/util/types";

import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";

import { remarkMissingInformation } from "./draft-markdown";
import { missingInformationComponents } from "./missing-information";
import { getConceptNoteGapForMarker } from "./gap-interview";

interface DraftTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
  applicationContextFailed: boolean;
  applicationContextLoading: boolean;
  bundle: ConceptNoteBundleProgress;
  canStartDrafting: boolean;
  draft: ConceptNoteDraftState | null;
  draftError: string | null;
  isDraftRunning: boolean;
  isConfirmingChapter: boolean;
  isRetrying: boolean;
  isStartingDraft: boolean;
  lng: string;
  noteName: string;
  onConfirmChapter: (chapter: ConceptNoteDraftChapter) => Promise<void>;
  onOpenContext: () => void;
  onReviewChapterGaps: (
    chapter: ConceptNoteDraftChapter,
    gap?: ConceptNoteGap,
  ) => void;
  onRetry: () => void;
  onStartDrafting: () => void;
  editFocus?: {
    chapterId: string;
    changeId?: string;
    requestId: string;
    focus: boolean;
  } | null;
  onFocusedChapterChange?: (chapterId: string) => void;
  isReviewing?: boolean;
  reviewChanges?: EditChange[];
  activeChangeId?: string;
  reviewDecisions?: Record<string, InlineReviewDecision>;
  reviewDecisionBusy?: boolean;
  onAcceptReviewChange?: (changeIds: string[]) => void;
  onRejectReviewChange?: (changeIds: string[]) => void;
}

interface DraftStatusPresentation {
  background: string;
  border: string;
  description: string;
  icon: IconType;
  title: string;
}

const baseMarkdownComponents = createChatMarkdownComponents({
  paragraph: {
    fontSize: "16px",
    lineHeight: "26px",
    color: "content.primary",
  },
  h1: {
    fontSize: "title.md",
    lineHeight: "24px",
    color: "content.primary",
  },
  h2: {
    fontSize: "18px",
    lineHeight: "28px",
    color: "content.primary",
  },
  h3: {
    fontSize: "16px",
    lineHeight: "26px",
    color: "content.primary",
  },
  list: {
    lineHeight: "26px",
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

function createDraftMarkdownComponents(
  onMissingInformationClick: (message: string) => void,
) {
  return missingInformationComponents(
    baseMarkdownComponents,
    onMissingInformationClick,
  );
}

function draftStatusKey(status: ConceptNoteDraftRunStatus): string {
  switch (status) {
    case "running":
      return "draft-status-running";
    case "failed":
      return "draft-status-failed";
    case "complete":
      return "draft-status-complete";
    case "not_started":
    default:
      return "draft-status-not-started";
  }
}

function chapterTone(status: ConceptNoteDraftChapterStatus): {
  dot: string;
} {
  switch (status) {
    case "ready":
      return {
        dot: "sentiment.positiveDefault",
      };
    case "draft":
      return {
        dot: "content.link",
      };
    case "needs_review":
      return {
        dot: "sentiment.warningDefault",
      };
    case "empty":
    default:
      return {
        dot: "content.tertiary",
      };
  }
}

function currentChapter(draft: ConceptNoteDraftState | null): string | null {
  if (!draft?.current_chapter_id) {
    return null;
  }
  return (
    draft.chapters.find(
      (chapter) => chapter.chapter_id === draft.current_chapter_id,
    )?.title ?? null
  );
}

function chapterPreviewMarkdown(markdown: string, title: string): string {
  const lines = markdown.trimStart().split(/\r?\n/);
  const firstLineTitle = lines[0]?.replace(/^#{1,6}\s+/, "").trim();
  const body =
    firstLineTitle?.toLocaleLowerCase() === title.trim().toLocaleLowerCase()
      ? lines.slice(1).join("\n").trimStart()
      : markdown;

  return body;
}

export function DraftTab({
  applicationContext,
  applicationContextFailed,
  applicationContextLoading,
  bundle,
  canStartDrafting,
  draft,
  draftError,
  isDraftRunning,
  isConfirmingChapter,
  isRetrying,
  isStartingDraft,
  lng,
  noteName,
  onConfirmChapter,
  onOpenContext,
  onReviewChapterGaps,
  onRetry,
  onStartDrafting,
  editFocus,
  onFocusedChapterChange,
  isReviewing,
  reviewChanges = [],
  activeChangeId,
  reviewDecisions,
  reviewDecisionBusy,
  onAcceptReviewChange,
  onRejectReviewChange,
}: DraftTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const chapterElements = useRef<Record<string, HTMLDivElement | null>>({});
  const previewElement = useRef<HTMLDivElement | null>(null);
  const [focusedChapterId, setFocusedChapterId] = useState<string | null>(null);
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false);
  useEffect(() => {
    if (!editFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const preview = previewElement.current;
      const chapter = chapterElements.current[editFocus.chapterId];
      if (!preview || !chapter) return;
      const target = editFocus.changeId
        ? ([...chapter.querySelectorAll<HTMLElement>("[data-change-ids]")].find(
            (element) =>
              element.dataset.changeIds
                ?.split(" ")
                .includes(editFocus.changeId!),
          ) ?? chapter)
        : chapter;
      setFocusedChapterId(editFocus.chapterId);
      preview.scrollTo({
        top: Math.max(
          0,
          target.getBoundingClientRect().top -
            preview.getBoundingClientRect().top +
            preview.scrollTop -
            48,
        ),
        behavior: "auto",
      });
      if (editFocus.focus)
        (target.hasAttribute("data-change-ids") ? target : preview).focus({
          preventScroll: true,
        });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editFocus]);
  const isReady = bundle.status === "ready";
  const isBuilding = bundle.status === "building";
  const isFailed = bundle.status === "failed";
  const hasNoUploadedEvidence = isReady && bundle.documentGrounding === "none";
  const draftStarted = Boolean(draft && draft.status !== "not_started");
  const showDraftSetup = !draftStarted || draft?.status === "failed";
  const activeChapterTitle = currentChapter(draft);
  const chapters = draft?.chapters ?? [];
  const selectedChapterId =
    focusedChapterId ?? draft?.current_chapter_id ?? chapters[0]?.chapter_id;
  const totalChapters =
    draft?.total_chapters ||
    applicationContext?.template?.chapter_schema.length ||
    0;
  const sectionsToggleLabel = t(
    sectionsCollapsed ? "expand-draft-sections" : "collapse-draft-sections",
  );
  const missingDraftingRequirements = [
    !applicationContext?.funder ? t("drafting-requirement-funder") : null,
    !applicationContext?.opportunity
      ? t("drafting-requirement-programme")
      : null,
    !applicationContext?.template ? t("drafting-requirement-template") : null,
  ].filter((requirement): requirement is string => Boolean(requirement));
  const draftingSetupBlocked =
    !canStartDrafting && draft?.status !== "complete" && !isDraftRunning;
  const draftingSetupDescription = applicationContextFailed
    ? t("drafting-setup-load-error")
    : applicationContextLoading
      ? t("drafting-setup-loading")
      : t("drafting-setup-missing", {
          requirements: missingDraftingRequirements.join(", "),
        });

  function reviewMissingInformationMarker(
    chapter: ConceptNoteDraftChapter,
    markerMessage: string,
  ): void {
    const gap = getConceptNoteGapForMarker(chapter, markerMessage);
    onReviewChapterGaps(chapter, gap ?? undefined);
  }

  let status: DraftStatusPresentation = {
    background: "background.neutral",
    border: "content.link",
    description: t("context-starting-description"),
    icon: LuDatabase,
    title: t("context-starting-title"),
  };

  if (isBuilding) {
    status = {
      background: "background.neutral",
      border: "content.link",
      description: t("building-source-context-description"),
      icon: LuSparkles,
      title: t("building-source-context"),
    };
  } else if (isFailed) {
    status = {
      background: "sentiment.negativeOverlay",
      border: "sentiment.negativeDefault",
      description: t("context-failed-description"),
      icon: LuCircleAlert,
      title: t("context-needs-attention"),
    };
  } else if (hasNoUploadedEvidence) {
    status = {
      background: "background.neutral",
      border: "content.link",
      description: t("no-uploaded-evidence-draft-description"),
      icon: LuDatabase,
      title: t("uploaded-evidence-none"),
    };
  } else if (isReady) {
    status = {
      background: "sentiment.positiveOverlay",
      border: "sentiment.positiveDefault",
      description: t("source-context-count", {
        count: bundle.readySources,
      }),
      icon: LuCheck,
      title: t("source-context-assembled"),
    };
  }

  return (
    <VStack
      align="stretch"
      gap={4}
      h={draftStarted ? "full" : "auto"}
      minH={0}
      p={draftStarted && !showDraftSetup ? 0 : { base: 4, md: 6 }}
    >
      {!draftStarted && (
        <Box>
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("draft-canvas")}
          </Text>
          <Text mt={1} fontSize="body.sm" color="content.tertiary">
            {noteName}
          </Text>
        </Box>
      )}

      {showDraftSetup && (
        <Flex
          align={{ base: "stretch", xl: "center" }}
          direction={{ base: "column", xl: "row" }}
          gap={4}
          border="1px solid"
          borderColor={status.border}
          borderRadius="rounded"
          bg={status.background}
          p={4}
        >
          <Flex align="start" gap={3} flex={1}>
            <Icon as={status.icon} mt={0.5} color={status.border} />
            <Box>
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
            </Box>
          </Flex>

          {isFailed && bundle.retryable ? (
            <Button
              size="sm"
              variant="outline"
              loading={isRetrying}
              onClick={onRetry}
            >
              <Icon as={LuRefreshCw} />
              {t("retry-context")}
            </Button>
          ) : !isBuilding && !isFailed ? (
            <HStack gap={2} flexWrap="wrap">
              <Button size="sm" variant="outline" onClick={onOpenContext}>
                <Icon as={LuDatabase} />
                {t("review-context")}
              </Button>
              <Button
                size="sm"
                variant="solid"
                aria-describedby={
                  draftingSetupBlocked ? "drafting-setup-reason" : undefined
                }
                disabled={
                  !canStartDrafting ||
                  isDraftRunning ||
                  draft?.status === "complete"
                }
                loading={isStartingDraft}
                onClick={onStartDrafting}
              >
                <Icon as={LuSparkles} />
                {t(draftStarted ? "continue-drafting" : "start-drafting")}
              </Button>
            </HStack>
          ) : null}
        </Flex>
      )}

      {draftingSetupBlocked && (
        <Flex
          id="drafting-setup-reason"
          align="start"
          gap={3}
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="rounded"
          bg="sentiment.warningOverlay"
          p={4}
          role="status"
        >
          <Icon
            as={LuCircleAlert}
            flexShrink={0}
            mt={0.5}
            color="sentiment.warningDefault"
          />
          <Box>
            <Text
              fontFamily="heading"
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("drafting-setup-required")}
            </Text>
            <Text
              mt={1}
              fontSize="label.sm"
              lineHeight="20px"
              color="content.secondary"
            >
              {draftingSetupDescription}
            </Text>
            {!applicationContextFailed && !applicationContextLoading && (
              <Text
                mt={1}
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {t("drafting-setup-review-context")}
              </Text>
            )}
          </Box>
        </Flex>
      )}

      {(!draftStarted || isDraftRunning || draft?.status === "failed") && (
        <Box
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="rounded"
          bg="base.light"
          p={4}
        >
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("draft-progress")}
          </Text>
          <Text mt={1} fontSize="label.sm" color="content.secondary">
            {t("draft-progress-count", {
              completed: draft?.completed_chapters ?? 0,
              total: totalChapters,
            })}
          </Text>
          {activeChapterTitle && (
            <Text mt={1} fontSize="label.sm" color="content.tertiary">
              {t("current-chapter", { chapter: activeChapterTitle })}
            </Text>
          )}
          {draftError && (
            <Text mt={3} fontSize="label.sm" color="sentiment.negativeDefault">
              {draftError}
            </Text>
          )}
          {draft?.error_code && !draftError && (
            <Text mt={3} fontSize="label.sm" color="sentiment.negativeDefault">
              {t("draft-failed-description")} ({draft.error_code})
            </Text>
          )}
          <HStack mt={3} gap={2}>
            <Box
              boxSize="7px"
              borderRadius="full"
              bg={
                chapterTone(
                  draft?.status === "failed"
                    ? "needs_review"
                    : draft?.status === "complete"
                      ? "ready"
                      : draftStarted
                        ? "draft"
                        : "empty",
                ).dot
              }
            />
            <Text fontSize="label.sm" color="content.secondary">
              {t(draftStatusKey(draft?.status ?? "not_started"))}
            </Text>
          </HStack>
          {!draftStarted && !draftError && (
            <Text mt={3} fontSize="body.sm" color="content.tertiary">
              {t("draft-empty-state")}
            </Text>
          )}
        </Box>
      )}

      {draftStarted && chapters.length > 0 && (
        <VStack align="stretch" flex={1} minH={0} gap={2}>
          <Flex
            direction={{ base: "column", xl: "row" }}
            flex={1}
            minH={0}
            gap={0}
            bg="base.light"
          >
            <VStack
              align="stretch"
              alignSelf={sectionsCollapsed ? "flex-start" : "stretch"}
              flexShrink={0}
              gap={2}
              w={{ base: "full", xl: sectionsCollapsed ? "44px" : "220px" }}
              h={{
                base: sectionsCollapsed ? "32px" : "auto",
                xl: sectionsCollapsed ? "32px" : "full",
              }}
              maxH={{
                base: sectionsCollapsed ? "32px" : "190px",
                xl: "full",
              }}
              minH={0}
              borderInlineEnd={{ base: "0", xl: "1px solid" }}
              borderBottom={{ base: "1px solid", xl: "0" }}
              borderColor="border.neutral"
              bg={sectionsCollapsed ? "transparent" : "base.light"}
              p={sectionsCollapsed ? 1 : 4}
              overflow={sectionsCollapsed ? "visible" : "hidden"}
              transition="width 180ms ease, max-height 180ms ease, padding 180ms ease"
            >
              <Flex
                align="center"
                justify={sectionsCollapsed ? "center" : "space-between"}
                gap={2}
                flexShrink={0}
              >
                {!sectionsCollapsed && (
                  <Text
                    fontFamily="heading"
                    fontSize="12px"
                    fontWeight="semibold"
                    color="content.tertiary"
                    letterSpacing="normal"
                    textTransform="uppercase"
                  >
                    {t("draft-sections")}
                  </Text>
                )}
                <chakra.button
                  type="button"
                  aria-controls="concept-note-sections-list"
                  aria-expanded={!sectionsCollapsed}
                  aria-label={sectionsToggleLabel}
                  title={sectionsToggleLabel}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  boxSize="28px"
                  flexShrink={0}
                  border={sectionsCollapsed ? "1px solid" : "0"}
                  borderColor="border.neutral"
                  borderRadius="6px"
                  bg="base.light"
                  color="content.secondary"
                  _hover={{ bg: "background.neutral" }}
                  _focusVisible={{
                    outline: "2px solid",
                    outlineColor: "content.link",
                    outlineOffset: "1px",
                  }}
                  onClick={() =>
                    setSectionsCollapsed((collapsed) => !collapsed)
                  }
                >
                  <Icon
                    as={sectionsCollapsed ? LuChevronRight : LuChevronLeft}
                    boxSize={4}
                  />
                </chakra.button>
              </Flex>
              <VStack
                id="concept-note-sections-list"
                aria-hidden={sectionsCollapsed}
                display={sectionsCollapsed ? "none" : "flex"}
                align="stretch"
                flex={1}
                minH={0}
                gap={1}
                overflowY="auto"
                pr={1}
              >
                {chapters.map((chapter) => {
                  const tone = chapterTone(chapter.status);
                  const isSelected = selectedChapterId === chapter.chapter_id;
                  const hasChanges = reviewChanges.some(
                    (change) => change.chapter_id === chapter.chapter_id,
                  );

                  return (
                    <Button
                      key={chapter.chapter_id}
                      type="button"
                      variant="ghost"
                      aria-current={isSelected ? "location" : undefined}
                      aria-label={t("jump-to-chapter", {
                        chapter: chapter.title,
                      })}
                      title={`${chapter.position + 1} ${chapter.title}`}
                      display="flex"
                      alignItems="center"
                      justifyContent="flex-start"
                      gap={2}
                      w="full"
                      borderRadius="6px"
                      bg={isSelected ? "background.neutral" : "transparent"}
                      px={2}
                      py={1.5}
                      minH="44px"
                      height="auto"
                      color={isSelected ? "content.link" : "content.primary"}
                      fontFamily="body"
                      fontWeight="normal"
                      letterSpacing="normal"
                      textAlign="left"
                      textTransform="none"
                      _hover={{
                        bg: "background.neutral",
                        color: "content.link",
                      }}
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "content.link",
                        outlineOffset: "1px",
                      }}
                      onClick={() => {
                        setFocusedChapterId(chapter.chapter_id);
                        onFocusedChapterChange?.(chapter.chapter_id);
                        if (chapter.open_gap_count > 0) {
                          onReviewChapterGaps(chapter);
                        }
                        const preview = previewElement.current;
                        const chapterElement =
                          chapterElements.current[chapter.chapter_id];

                        if (preview && chapterElement) {
                          const chapterTop =
                            chapterElement.getBoundingClientRect().top -
                            preview.getBoundingClientRect().top +
                            preview.scrollTop -
                            48;
                          preview.scrollTo({
                            behavior: "smooth",
                            top: Math.max(0, chapterTop),
                          });
                        }
                      }}
                    >
                      <Box
                        flexShrink={0}
                        boxSize="6px"
                        borderRadius="full"
                        bg={tone.dot}
                      />
                      <Text
                        minW={0}
                        flex={1}
                        fontSize="13px"
                        lineHeight="20px"
                        color="inherit"
                        letterSpacing="normal"
                        textTransform="none"
                        whiteSpace="normal"
                      >
                        {chapter.position + 1} {chapter.title}
                      </Text>
                      {hasChanges && (
                        <Box
                          data-testid="concept-note-section-has-changes"
                          role="img"
                          aria-label={t("edit-section-has-changes")}
                          flexShrink={0}
                          boxSize="7px"
                          borderRadius="full"
                          bg="content.link"
                        />
                      )}
                    </Button>
                  );
                })}
              </VStack>
            </VStack>

            <Box
              ref={previewElement}
              data-testid="concept-note-draft-preview"
              tabIndex={-1}
              flex={1}
              minW={0}
              minH="360px"
              overflowY="auto"
              scrollBehavior="smooth"
              bg="base.light"
              p={{ base: 5, md: 8 }}
              fontSize="16px"
              _focus={{
                outline: "2px solid",
                outlineColor: "content.link",
                outlineOffset: "2px",
              }}
            >
              <Box bg="base.light" pb={3}>
                <Text
                  fontFamily="heading"
                  fontSize="22px"
                  fontWeight="semibold"
                  color="content.primary"
                >
                  {t("draft-preview-document-title", { name: noteName })}
                </Text>
              </Box>

              <VStack align="stretch" mt={4} gap={9}>
                {chapters.map((chapter) => (
                  <Box
                    key={chapter.chapter_id}
                    data-chapter-id={chapter.chapter_id}
                    ref={(element: HTMLDivElement | null) => {
                      chapterElements.current[chapter.chapter_id] = element;
                    }}
                    scrollMarginTop={4}
                  >
                    <Flex
                      align={{ base: "start", md: "center" }}
                      justify="space-between"
                      direction={{ base: "column", md: "row" }}
                      gap={2}
                      mb={3}
                      pb={2}
                    >
                      <Box>
                        <Text
                          fontFamily="heading"
                          fontSize="18px"
                          fontWeight="semibold"
                          lineHeight="28px"
                          color="content.primary"
                        >
                          {chapter.position + 1} · {chapter.title}
                        </Text>
                        <HStack mt={1} gap={2} flexWrap="wrap">
                          <Text fontSize="10px" color="content.tertiary">
                            {t(
                              chapter.status === "needs_review"
                                ? "chapter-status-needs-review"
                                : chapter.status === "ready"
                                  ? "chapter-status-ready"
                                  : "chapter-status-draft",
                            )}
                          </Text>
                          {chapter.open_gap_count > 0 && (
                            <Text
                              fontSize="10px"
                              color="sentiment.warningDefault"
                            >
                              {t("chapter-open-gaps", {
                                count: chapter.open_gap_count,
                              })}
                            </Text>
                          )}
                          {chapter.caveat_count > 0 && (
                            <Text fontSize="10px" color="content.tertiary">
                              {t("chapter-caveats", {
                                count: chapter.caveat_count,
                              })}
                            </Text>
                          )}
                          {chapter.proposed_revision_number && (
                            <Text fontSize="10px" color="content.link">
                              {t("chapter-proposed-revision")}
                            </Text>
                          )}
                        </HStack>
                      </Box>
                      {chapter.status === "draft" &&
                        chapter.open_gap_count === 0 &&
                        chapter.regeneration_status === "idle" && (
                          <Button
                            size="xs"
                            variant="solid"
                            loading={isConfirmingChapter}
                            onClick={() => void onConfirmChapter(chapter)}
                          >
                            <Icon as={LuCheck} />
                            {t("review-and-confirm")}
                          </Button>
                        )}
                    </Flex>
                    {chapter.regeneration_status === "processing" && (
                      <Text mb={3} fontSize="label.sm" color="content.link">
                        {t("chapter-regenerating")}
                      </Text>
                    )}
                    {chapter.regeneration_status === "failed" && (
                      <Text
                        mb={3}
                        fontSize="label.sm"
                        color="sentiment.negativeDefault"
                      >
                        {t("chapter-regeneration-failed")}
                      </Text>
                    )}
                    {typeof chapter.body_markdown === "string" ? (
                      (() => {
                        const changes = reviewChanges.filter(
                          (change) => change.chapter_id === chapter.chapter_id,
                        );
                        const comparingChapter =
                          !isReviewing &&
                          Boolean(
                            chapter.proposed_revision_number &&
                            chapter.confirmed_body_markdown,
                          );
                        if (changes.length || comparingChapter) {
                          const before = comparingChapter
                            ? chapter.confirmed_body_markdown!
                            : chapter.body_markdown!;
                          const differences = comparingChapter
                            ? snapshotChanges(
                                chapter,
                                before,
                                chapter.body_markdown!,
                              )
                            : changes;
                          return (
                            <Box data-testid="concept-note-chapter-inline-review">
                              {comparingChapter && (
                                <Text fontSize="label.sm" mb={2}>
                                  {t("chapter-proposed-review-title")}
                                </Text>
                              )}
                              <InlineDocumentDiff
                                markdown={before}
                                changes={differences}
                                lng={lng}
                                activeChangeId={activeChangeId}
                                components={baseMarkdownComponents}
                                decisions={reviewDecisions}
                                disabled={reviewDecisionBusy}
                                onAcceptChange={onAcceptReviewChange}
                                onRejectChange={onRejectReviewChange}
                              />
                            </Box>
                          );
                        }
                        return (
                          <Box
                            data-testid="concept-note-current-chapter-body"
                            data-current-chapter-id={chapter.chapter_id}
                            data-current-revision={chapter.revision_number}
                          >
                            <ReactMarkdown
                              components={createDraftMarkdownComponents(
                                (message) =>
                                  reviewMissingInformationMarker(
                                    chapter,
                                    message,
                                  ),
                              )}
                              remarkPlugins={[
                                remarkGfm,
                                remarkMissingInformation,
                              ]}
                            >
                              {chapterPreviewMarkdown(
                                chapter.body_markdown!,
                                chapter.title,
                              )}
                            </ReactMarkdown>
                          </Box>
                        );
                      })()
                    ) : (
                      <Text fontSize="body.sm" color="content.tertiary">
                        {t("chapter-awaiting-copy")}
                      </Text>
                    )}
                  </Box>
                ))}
              </VStack>
            </Box>
          </Flex>
        </VStack>
      )}
    </VStack>
  );
}
