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
  replaceMissingInformationMarkers,
} from "./draft-markdown";
import {
  getChapterDisplayStatus,
  type ChapterDisplayStatus,
} from "./chapter-validation";
import type { DraftFocusController } from "./use-draft-focus";

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
  return replaceMissingInformationMarkers(body);
}

interface DraftDocumentPanelProps {
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
}: DraftDocumentPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const { chapterElements, focusedFindingElement, previewElement } = focus;

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
                  onClick={() => focus.selectChapter(chapter.chapter_id)}
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
                    <Text mt={2} fontSize="label.sm" color="content.secondary">
                      <chakra.span fontWeight="semibold">
                        {t("review-action-label")}
                      </chakra.span>{" "}
                      {focus.focusedFinding.finding.suggested_action}
                    </Text>
                  </Box>
                )}
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
  );
}
