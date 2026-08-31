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
import { useEffect, useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  LuCheck,
  LuCircleAlert,
  LuDatabase,
  LuRefreshCw,
  LuSparkles,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftRunStatus,
  ConceptNoteDraftState,
} from "@/util/types";

import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";

import {
  decodeMissingInformationMessage,
  MISSING_INFORMATION_LINK,
  replaceMissingInformationMarkers,
} from "./draft-markdown";
import {
  type ChapterDisplayStatus,
  getChapterDisplayStatus,
} from "./chapter-validation";

interface DraftTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
  applicationContextFailed: boolean;
  applicationContextLoading: boolean;
  bundle: ConceptNoteBundleProgress;
  canStartDrafting: boolean;
  draft: ConceptNoteDraftState | null;
  draftError: string | null;
  focusChapterId: string | null;
  isDraftRunning: boolean;
  isRetrying: boolean;
  isStartingDraft: boolean;
  lng: string;
  noteName: string;
  onOpenContext: () => void;
  onRetry: () => void;
  onStartDrafting: () => void;
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

const markdownComponents = {
  ...baseMarkdownComponents,
  a: ({ children, href, title }: React.ComponentPropsWithoutRef<"a">) => {
    const missingInformation =
      href === MISSING_INFORMATION_LINK
        ? decodeMissingInformationMessage(title)
        : null;

    if (missingInformation) {
      return (
        <Tooltip
          showArrow
          portalled
          content={missingInformation}
          contentProps={{
            maxW: "360px",
            px: 3,
            py: 2,
            fontSize: "label.sm",
            lineHeight: "20px",
          }}
        >
          <chakra.button
            type="button"
            aria-label={missingInformation}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            boxSize="18px"
            mx={1}
            borderRadius="full"
            bg="sentiment.warningOverlay"
            color="sentiment.warningDefault"
            verticalAlign="text-bottom"
            cursor="help"
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "content.link",
              outlineOffset: "1px",
            }}
          >
            <Icon as={LuCircleAlert} boxSize="12px" />
          </chakra.button>
        </Tooltip>
      );
    }

    return (
      <chakra.a
        href={href}
        color="interactive.primary"
        fontWeight="semibold"
        textDecoration="underline"
        display="inline"
      >
        {children}
      </chakra.a>
    );
  },
};

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

function chapterTone(status: ChapterDisplayStatus): {
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
    case "stale":
      return {
        dot: "sentiment.warningDefault",
      };
    case "incomplete":
      return {
        dot: "sentiment.negativeDefault",
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

  return replaceMissingInformationMarkers(body);
}

export function DraftTab({
  applicationContext,
  applicationContextFailed,
  applicationContextLoading,
  bundle,
  canStartDrafting,
  draft,
  draftError,
  focusChapterId,
  isDraftRunning,
  isRetrying,
  isStartingDraft,
  lng,
  noteName,
  onOpenContext,
  onRetry,
  onStartDrafting,
}: DraftTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const chapterElements = useRef<Record<string, HTMLDivElement | null>>({});
  const previewElement = useRef<HTMLDivElement | null>(null);
  const [focusedChapterId, setFocusedChapterId] = useState<string | null>(null);
  const isReady = bundle.status === "ready";
  const isBuilding = bundle.status === "building";
  const isFailed = bundle.status === "failed";
  const hasNoUploadedEvidence = isReady && bundle.documentGrounding === "none";
  const draftStarted = Boolean(draft && draft.status !== "not_started");
  const showDraftSetup = !draftStarted || draft?.status === "failed";
  const activeChapterTitle = currentChapter(draft);
  const chapters = useMemo(() => draft?.chapters ?? [], [draft?.chapters]);
  const selectedChapterId =
    focusedChapterId ?? draft?.current_chapter_id ?? chapters[0]?.chapter_id;
  const totalChapters =
    draft?.total_chapters ||
    applicationContext?.template?.chapter_schema.length ||
    0;
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

  useEffect(() => {
    if (
      !focusChapterId ||
      !chapters.some((chapter) => chapter.chapter_id === focusChapterId)
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      setFocusedChapterId(focusChapterId);
      const preview = previewElement.current;
      const chapterElement = chapterElements.current[focusChapterId];
      if (!preview || !chapterElement) {
        return;
      }
      const chapterTop =
        chapterElement.getBoundingClientRect().top -
        preview.getBoundingClientRect().top +
        preview.scrollTop -
        48;
      preview.scrollTo({ behavior: "smooth", top: Math.max(0, chapterTop) });
    });
    return () => cancelAnimationFrame(frame);
  }, [chapters, focusChapterId]);

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
      p={{ base: 4, md: 6 }}
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
            direction={{ base: "column", lg: "row" }}
            flex={1}
            minH={0}
            gap={3}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            bg="background.alternativeLight"
            p={4}
          >
            <VStack
              align="stretch"
              flexShrink={0}
              gap={2}
              w={{ base: "full", lg: "160px", xl: "180px" }}
              maxH={{ base: "190px", lg: "full" }}
              minH={0}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              p={3}
            >
              <Text
                flexShrink={0}
                fontFamily="heading"
                fontSize="10px"
                fontWeight="semibold"
                color="content.tertiary"
                letterSpacing="1.5px"
                textTransform="uppercase"
              >
                {t("draft-sections")}
              </Text>
              <VStack
                align="stretch"
                flex={1}
                minH={0}
                gap={1}
                overflowY="auto"
                pr={1}
              >
                {chapters.map((chapter) => {
                  const tone = chapterTone(getChapterDisplayStatus(chapter));
                  const isSelected = selectedChapterId === chapter.chapter_id;

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
                      fontFamily="body"
                      fontWeight="normal"
                      letterSpacing="normal"
                      textAlign="left"
                      textTransform="none"
                      _hover={{ bg: "background.neutral" }}
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "content.link",
                        outlineOffset: "1px",
                      }}
                      onClick={() => {
                        setFocusedChapterId(chapter.chapter_id);
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
                        overflow="hidden"
                        fontSize="11px"
                        lineHeight="16px"
                        color="content.secondary"
                        letterSpacing="normal"
                        textOverflow="ellipsis"
                        textTransform="none"
                        whiteSpace="nowrap"
                      >
                        {chapter.position + 1} {chapter.title}
                      </Text>
                    </Button>
                  );
                })}
              </VStack>
            </VStack>

            <Box
              ref={previewElement}
              data-testid="concept-note-draft-preview"
              flex={1}
              minW={0}
              minH="360px"
              overflowY="auto"
              scrollBehavior="smooth"
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              p={{ base: 4, md: 5 }}
            >
              <Box position="sticky" zIndex={1} top={-1} bg="base.light" pb={3}>
                <Text
                  fontFamily="heading"
                  fontSize="body.md"
                  fontWeight="semibold"
                  color="content.primary"
                >
                  {t("draft-preview-document-title", { name: noteName })}
                </Text>
              </Box>

              <VStack align="stretch" mt={4} gap={5}>
                {chapters.map((chapter) => (
                  <Box
                    key={chapter.chapter_id}
                    ref={(element: HTMLDivElement | null) => {
                      chapterElements.current[chapter.chapter_id] = element;
                    }}
                    scrollMarginTop={4}
                  >
                    <Text
                      mb={3}
                      pb={2}
                      borderBottom="1px solid"
                      borderColor="border.neutral"
                      fontFamily="heading"
                      fontSize="18px"
                      fontWeight="semibold"
                      lineHeight="28px"
                      color="content.primary"
                    >
                      {chapter.position + 1} · {chapter.title}
                    </Text>
                    {chapter.body_markdown ? (
                      <ReactMarkdown
                        components={markdownComponents}
                        remarkPlugins={[remarkGfm]}
                      >
                        {chapterPreviewMarkdown(
                          chapter.body_markdown,
                          chapter.title,
                        )}
                      </ReactMarkdown>
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
