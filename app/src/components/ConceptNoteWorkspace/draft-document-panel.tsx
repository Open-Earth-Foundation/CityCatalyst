import { useEffect } from "react";
import type { EditChange } from "@/util/concept-note-edit-types";
import type { InlineReviewDecision } from "./inline-review";
import { InlineDocumentDiff } from "./edit-diff";
import {
  Box,
  chakra,
  Flex,
  HStack,
  Icon,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuCircleAlert,
} from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { Button } from "@/components/ui/button";
import {
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteDraftChapter } from "@/util/types";

import {
  decodeMissingInformationMessage,
  MISSING_INFORMATION_LINK,
  remarkMissingInformation,
} from "./draft-markdown";
import {
  getChapterDisplayStatus,
  type ChapterDisplayStatus,
} from "./chapter-validation";
import type { DraftFocusController } from "./use-draft-focus";
import { ValidationEvidence } from "./validation-evidence";

const baseMarkdownComponents = createChatMarkdownComponents({
  paragraph: {
    fontSize: "body.sm",
    lineHeight: "22px",
    color: "content.primary",
  },
  h1: { fontSize: "title.md", lineHeight: "24px", color: "content.primary" },
  h2: { fontSize: "body.md", lineHeight: "22px", color: "content.primary" },
  h3: { fontSize: "body.sm", lineHeight: "22px", color: "content.primary" },
  list: { lineHeight: "22px", color: "content.primary" },
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
  blockquote: { borderColor: "border.overlay", color: "content.tertiary" },
});

const markdownComponents = {
  ...baseMarkdownComponents,
  a: ({ children, href, title }: React.ComponentPropsWithoutRef<"a">) => {
    const message =
      href === MISSING_INFORMATION_LINK
        ? decodeMissingInformationMessage(title)
        : null;
    if (!message) {
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
    }

    return (
      <PopoverRoot
        lazyMount
        positioning={{ placement: "top", offset: { mainAxis: 10 } }}
      >
        <PopoverTrigger asChild>
          <chakra.button
            type="button"
            aria-label={message}
            display="inline-grid"
            placeItems="center"
            boxSize="26px"
            mx={1}
            border="1px solid"
            borderColor="sentiment.warningDefault"
            borderRadius="7px"
            bg="sentiment.warningOverlay"
            color="sentiment.warningDefault"
            lineHeight={1}
            verticalAlign="middle"
            cursor="pointer"
            transitionDuration="150ms"
            transitionProperty="background, color, box-shadow, transform"
            _hover={{
              bg: "sentiment.warningDefault",
              color: "base.light",
              boxShadow: "1dp",
            }}
            _active={{ transform: "scale(0.95)" }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "content.link",
              outlineOffset: "2px",
            }}
          >
            <Icon as={LuCircleAlert} boxSize="16px" />
          </chakra.button>
        </PopoverTrigger>
        <PopoverContent
          w={{ base: "calc(100vw - 32px)", sm: "420px" }}
          maxW="420px"
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="rounded"
          bg="base.light"
          boxShadow="3dp"
        >
          <PopoverArrow />
          <PopoverBody p={4}>
            <HStack align="start" gap={3}>
              <Icon
                as={LuCircleAlert}
                flexShrink={0}
                mt={0.5}
                boxSize="20px"
                color="sentiment.warningDefault"
              />
              <Text
                fontSize="body.sm"
                lineHeight="22px"
                color="content.primary"
              >
                {message}
              </Text>
            </HStack>
          </PopoverBody>
        </PopoverContent>
      </PopoverRoot>
    );
  },
};

export function chapterTone(status: ChapterDisplayStatus): string {
  switch (status) {
    case "ready":
      return "sentiment.positiveDefault";
    case "draft":
      return "content.link";
    case "needs_review":
    case "stale":
      return "sentiment.warningDefault";
    case "incomplete":
      return "sentiment.negativeDefault";
    default:
      return "content.tertiary";
  }
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

export interface DraftInlineReviewProps {
  isConfirmingChapter: boolean;
  onConfirmChapter: (chapter: ConceptNoteDraftChapter) => void;
  editFocus?: {
    chapterId: string;
    changeId?: string;
    requestId: string;
    focus: boolean;
  } | null;
  onFocusedChapterChange?: (chapterId: string) => void;
  reviewChanges?: EditChange[];
  activeChangeId?: string;
  reviewDecisions?: Record<string, InlineReviewDecision>;
  reviewDecisionBusy?: boolean;
  onAcceptReviewChange?: (changeIds: string[]) => void;
  onRejectReviewChange?: (changeIds: string[]) => void;
}

interface DraftDocumentPanelProps extends DraftInlineReviewProps {
  chapters: ConceptNoteDraftChapter[];
  focus: DraftFocusController;
  focusFindingKey: string | null;
  lng: string;
  noteName: string;
}

export function DraftDocumentPanel({
  chapters,
  focus,
  focusFindingKey,
  lng,
  noteName,
  editFocus,
  onFocusedChapterChange,
  reviewChanges = [],
  activeChangeId,
  reviewDecisions,
  reviewDecisionBusy,
  onAcceptReviewChange,
  onRejectReviewChange,
  isConfirmingChapter,
  onConfirmChapter,
}: DraftDocumentPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const {
    chapterElements,
    focusedFindingElement,
    previewElement,
    selectChapter,
  } = focus;

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
      selectChapter(editFocus.chapterId);
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
  }, [editFocus, chapterElements, previewElement, selectChapter]);

  return (
    <VStack align="stretch" flex={1} minH={0} gap={2}>
      <Flex
        direction={{ base: "column", lg: "row" }}
        flex={1}
        minH={0}
        gap={focus.isChapterPanelOpen ? 5 : 0}
      >
        <VStack
          id="concept-note-chapter-panel"
          role="region"
          aria-label={t("draft-sections")}
          align="stretch"
          flexShrink={0}
          position="relative"
          gap={focus.isChapterPanelOpen ? 2 : 0}
          w={
            focus.isChapterPanelOpen
              ? { base: "full", lg: "160px", xl: "180px" }
              : { base: "full", lg: "0px" }
          }
          maxH={
            focus.isChapterPanelOpen
              ? { base: "190px", lg: "full" }
              : { base: "0px", lg: "full" }
          }
          minH={0}
          borderWidth={focus.isChapterPanelOpen ? "1px" : "0"}
          borderStyle="solid"
          borderColor="border.neutral"
          borderRadius="rounded"
          bg={focus.isChapterPanelOpen ? "base.light" : "transparent"}
          overflow="visible"
          p={focus.isChapterPanelOpen ? 3 : 0}
          transition="width 160ms ease, max-height 160ms ease, padding 160ms ease, border-width 160ms ease"
        >
          {focus.isChapterPanelOpen && (
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
          )}
          <Tooltip
            content={t(
              focus.isChapterPanelOpen
                ? "hide-chapter-panel"
                : "show-chapter-panel",
            )}
          >
            <Button
              type="button"
              variant="outline"
              aria-controls="concept-note-chapter-panel"
              aria-expanded={focus.isChapterPanelOpen}
              aria-label={t(
                focus.isChapterPanelOpen
                  ? "hide-chapter-panel"
                  : "show-chapter-panel",
              )}
              position="absolute"
              zIndex={2}
              insetEnd={{ base: "50%", lg: "-18px" }}
              bottom={{ base: "-18px", lg: "auto" }}
              top={{ base: "auto", lg: "50%" }}
              transform={{ base: "translateX(50%)", lg: "translateY(-50%)" }}
              minW="36px"
              h="36px"
              borderColor="border.neutral"
              borderRadius="full"
              bg="base.light"
              color="content.link"
              p={0}
              boxShadow="1dp"
              transitionDuration="150ms"
              transitionProperty="background, border-color, box-shadow"
              _hover={{
                borderColor: "content.link",
                bg: "background.neutral",
                boxShadow: "2dp",
              }}
              onClick={focus.toggleChapterPanel}
            >
              <Icon
                as={focus.isChapterPanelOpen ? LuChevronUp : LuChevronDown}
                display={{ base: "block", lg: "none" }}
                boxSize="18px"
              />
              <Icon
                as={focus.isChapterPanelOpen ? LuChevronLeft : LuChevronRight}
                display={{ base: "none", lg: "block" }}
                boxSize="18px"
              />
            </Button>
          </Tooltip>
          <VStack
            id="concept-note-chapter-list"
            hidden={!focus.isChapterPanelOpen}
            align="stretch"
            flex={1}
            minH={0}
            gap={1}
            overflowY="auto"
            pr={1}
          >
            {chapters.map((chapter) => {
              const isSelected = focus.selectedChapterId === chapter.chapter_id;
              return (
                <Button
                  key={chapter.chapter_id}
                  type="button"
                  variant="ghost"
                  aria-current={isSelected ? "location" : undefined}
                  aria-label={t("jump-to-chapter", { chapter: chapter.title })}
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
                    focus.selectChapter(chapter.chapter_id);
                    onFocusedChapterChange?.(chapter.chapter_id);
                  }}
                >
                  <Box
                    flexShrink={0}
                    boxSize="6px"
                    borderRadius="full"
                    bg={chapterTone(getChapterDisplayStatus(chapter))}
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
                  {reviewChanges.some(
                    (change) => change.chapter_id === chapter.chapter_id,
                  ) && (
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
                          getChapterDisplayStatus(chapter) === "needs_review"
                            ? "chapter-status-needs-review"
                            : getChapterDisplayStatus(chapter) === "ready"
                              ? "chapter-status-ready"
                              : "chapter-status-draft",
                        )}
                      </Text>
                      {chapter.open_gap_count > 0 && (
                        <Text fontSize="10px" color="sentiment.warningDefault">
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
                    </HStack>
                  </Box>
                  {chapter.status === "draft" &&
                    chapter.open_gap_count === 0 && (
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
                {focus.focusedFinding?.chapterId === chapter.chapter_id && (
                  <Box
                    ref={focusedFindingElement}
                    data-testid="focused-review-finding"
                    data-review-finding-key={focusFindingKey}
                    tabIndex={-1}
                    mb={4}
                    border="1px solid"
                    borderColor={
                      focus.focusedFinding.finding.severity === "blocking"
                        ? "sentiment.negativeDefault"
                        : "sentiment.warningDefault"
                    }
                    borderRadius="rounded"
                    bg={
                      focus.focusedFinding.finding.severity === "blocking"
                        ? "sentiment.negativeOverlay"
                        : "sentiment.warningOverlay"
                    }
                    p={3}
                    scrollMarginTop={12}
                    _focusVisible={{
                      outline: "2px solid",
                      outlineColor: "content.link",
                      outlineOffset: "2px",
                    }}
                  >
                    <Text
                      fontSize="label.sm"
                      fontWeight="semibold"
                      color="content.primary"
                    >
                      {t(
                        focus.focusedFinding.finding.severity === "blocking"
                          ? "review-blocking"
                          : "review-warning",
                      )}
                    </Text>
                    <Text mt={1} fontSize="body.sm" color="content.primary">
                      {focus.focusedFinding.finding.message}
                    </Text>
                    {focus.focusedFinding.finding.excerpts?.[0] && (
                      <Text
                        mt={2}
                        fontSize="label.sm"
                        fontStyle="italic"
                        color="content.secondary"
                      >
                        {focus.focusedFinding.finding.excerpts[0]}
                      </Text>
                    )}
                    <ValidationEvidence
                      evidence={focus.focusedFinding.finding.evidence}
                      lng={lng}
                    />
                    <Text mt={2} fontSize="label.sm" color="content.secondary">
                      <chakra.span fontWeight="semibold">
                        {t("review-action-label")}
                      </chakra.span>{" "}
                      {focus.focusedFinding.finding.suggested_action}
                    </Text>
                  </Box>
                )}
                {typeof chapter.body_markdown === "string" ? (
                  (() => {
                    const changes = reviewChanges.filter(
                      (change) => change.chapter_id === chapter.chapter_id,
                    );
                    if (changes.length) {
                      return (
                        <Box data-testid="concept-note-chapter-inline-review">
                          <InlineDocumentDiff
                            markdown={chapter.body_markdown!}
                            changes={changes}
                            lng={lng}
                            activeChangeId={activeChangeId}
                            components={markdownComponents}
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
                          components={markdownComponents}
                          remarkPlugins={[remarkGfm, remarkMissingInformation]}
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
  );
}
