"use client";

import { Box, Flex, Icon, Text, chakra } from "@chakra-ui/react";
import { useRef, useState, type ReactNode } from "react";
import { LuArrowLeft, LuChevronRight, LuMessageSquare } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  PopoverArrow,
  PopoverBody,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";
import {
  informationMarkerKey,
  missingInformationRanges,
} from "./draft-markdown";

export interface ChapterGapRow {
  id: string;
  question: string;
  title?: string;
  whyAsking?: string;
  severity: "critical" | "noncritical";
  gap: ConceptNoteGap | null;
  /** The marker exactly as written in the chapter, when the row has one. */
  marker?: string;
}

/** A caveat gap holds an accepted estimate that still needs confirming. */
export const isEstimate = (row: ChapterGapRow) => row.gap?.state === "caveat";

/**
 * Open gaps plus unrecorded markers, in document order, titled by their
 * heading. Estimates have no marker left, so they follow the open gaps.
 */
export function chapterGapRows(
  chapter: ConceptNoteDraftChapter,
): ChapterGapRow[] {
  const markdown = chapter.body_markdown ?? "";
  const markers = missingInformationRanges(markdown);
  // Same key as Climate Advisor, so a record pairs with its marker however
  // either one is formatted.
  const keys = markers.map((marker) => informationMarkerKey(marker.message));
  const rows: ChapterGapRow[] = chapter.gaps
    .filter((gap) => ["open", "processing", "caveat"].includes(gap.state))
    .map((gap) => ({
      id: gap.gap_id,
      question: gap.question,
      whyAsking: gap.why_asking,
      severity: gap.severity,
      gap,
    }));
  // Resolved gaps keep their markers out; legacy markers get their own row.
  for (const { message } of markers) {
    const key = informationMarkerKey(message);
    // An empty key (punctuation only) gets no record, so it gets no row.
    if (
      key &&
      ![...chapter.gaps, ...rows].some(
        (item) => informationMarkerKey(item.question) === key,
      )
    )
      rows.push({
        id: "marker-" + rows.length,
        question: message.replace(/^information needed:\s*/i, "").trim(),
        severity: "critical",
        gap: null,
      });
  }
  const position = (row: ChapterGapRow) => {
    // Estimates have no marker; they always follow the open gaps.
    if (isEstimate(row)) return keys.length + 1;
    const index = keys.indexOf(informationMarkerKey(row.question));
    return index < 0 ? keys.length : index;
  };
  for (const row of rows) {
    const marker = markers[position(row)];
    if (!marker) continue;
    row.marker = markdown.slice(marker.start, marker.end);
    row.title = markdown
      .slice(0, marker.start)
      .match(/^#{1,6}\s+(.+)$/gm)
      ?.at(-1)
      ?.replace(/^#{1,6}\s+/, "")
      .trim();
  }
  return rows.sort((a, b) => position(a) - position(b));
}

export function gapRowForMessage(rows: ChapterGapRow[], message: string) {
  const key = informationMarkerKey(message);
  return rows.find((row) => informationMarkerKey(row.question) === key);
}

interface ChapterGapsPanelProps {
  chapter: ConceptNoteDraftChapter;
  lng: string;
  rows: ChapterGapRow[];
  onAnswerGap?: (chapter: ConceptNoteDraftChapter, row: ChapterGapRow) => void;
}
type GapDetailProps = Omit<ChapterGapsPanelProps, "rows"> & {
  row: ChapterGapRow;
  number: number;
};

const severityKey = (row: ChapterGapRow) =>
  row.severity === "critical"
    ? "gap-severity-critical"
    : "gap-severity-noncritical";
const severityColor = (row: ChapterGapRow) =>
  row.severity === "critical" ? "sentiment.warningFg" : "content.secondary";
const severityBorder = (row: ChapterGapRow) =>
  row.severity === "critical" ? "sentiment.warningDefault" : "gray.medium";

/**
 * Scroll shadows: a thin shade at an edge only while more content is hidden
 * past it (the "local" covers hide it otherwise), so a scrolling region never
 * looks complete when it is cut off. Content that fits looks unchanged.
 */
const scrollShadows = {
  background:
    "linear-gradient({colors.base.light} 30%, transparent) center top, " +
    "linear-gradient(transparent, {colors.base.light} 70%) center bottom, " +
    "linear-gradient({colors.border.neutral}, transparent) center top, " +
    "linear-gradient(transparent, {colors.border.neutral}) center bottom",
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% 24px, 100% 24px, 100% 10px, 100% 10px",
  backgroundAttachment: "local, local, scroll, scroll",
};

function GapDetails({
  lng,
  row,
  number,
  onAnswer,
}: {
  lng: string;
  row: ChapterGapRow;
  number: number;
  onAnswer?: () => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const estimate = isEstimate(row) ? row.gap?.resolution?.answer : undefined;
  return (
    <Flex
      direction="column"
      minH={0}
      data-testid="concept-note-chapter-gap"
      data-severity={row.severity}
      data-state={row.gap?.state}
    >
      <PopoverTitle
        fontFamily="heading"
        fontSize="body.sm"
        fontWeight="semibold"
        pr={6}
      >
        {row.title || t("gap-missing-information")}
      </PopoverTitle>
      <Text
        mt={2}
        fontSize="body.sm"
        fontWeight="semibold"
        color={severityColor(row)}
      >
        <chakra.span data-testid="concept-note-gap-number">
          {t("gap-number", { number })}
        </chakra.span>
        {" · "}
        {t(isEstimate(row) ? "gap-state-caveat" : severityKey(row))}
      </Text>
      {/* Only the long text scrolls, so "Answer in chat" stays in view below it. */}
      <Box
        mt={3}
        minH={0}
        overflowY="auto"
        css={scrollShadows}
        data-testid="concept-note-chapter-gap-text"
      >
        <Text fontSize="body.sm" lineHeight="22px" color="content.primary">
          {row.question}
        </Text>
        {estimate && (
          <Box
            mt={3}
            px={3}
            py={2}
            bg="sentiment.warningOverlay"
            borderLeft="3px solid"
            borderColor="sentiment.warningDefault"
            borderRadius="rounded"
            data-testid="concept-note-gap-estimate"
          >
            <Text fontSize="label.sm" fontWeight="semibold">
              {t("gap-current-estimate")}
            </Text>
            <Text fontSize="body.sm" color="content.secondary">
              {estimate}
            </Text>
          </Box>
        )}
        {row.gap?.answered_so_far && (
          <Box
            mt={4}
            pt={3}
            borderTop="1px solid"
            borderColor="border.neutral"
            data-testid="concept-note-gap-answered-so-far"
          >
            <Text fontSize="body.sm" fontWeight="semibold">
              {t("gap-answered-so-far")}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.tertiary">
              {t("gap-answered-so-far-hint")}
            </Text>
            <Text
              mt={1}
              fontSize="body.sm"
              lineHeight="22px"
              color="content.secondary"
              whiteSpace="pre-wrap"
              overflowWrap="anywhere"
            >
              {row.gap.answered_so_far}
            </Text>
          </Box>
        )}
        {row.whyAsking && (
          <Box mt={4} pt={3} borderTop="1px solid" borderColor="border.neutral">
            <Text fontSize="body.sm" fontWeight="semibold">
              {t("gap-why-needed")}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.tertiary">
              {t("gap-clima-rationale")}
            </Text>
            <Text
              mt={1}
              fontSize="body.sm"
              lineHeight="22px"
              color="content.secondary"
            >
              {row.whyAsking}
            </Text>
          </Box>
        )}
      </Box>
      {onAnswer && (
        <Button
          mt={4}
          w="full"
          size="sm"
          variant="outline"
          flexShrink={0}
          data-testid="concept-note-chapter-gap-answer"
          onClick={onAnswer}
        >
          <Icon as={LuMessageSquare} />
          {t(isEstimate(row) ? "gap-confirm-in-chat" : "gap-answer-in-chat")}
        </Button>
      )}
    </Flex>
  );
}

/** Width of both gap popovers; phones get the viewport minus 32 px. */
const POPOVER_WIDTH = 360;

/**
 * Wide screens open a marker's details to its left, as before. Phones have
 * room on neither side of the marker, so there the details open below it
 * (flipping above when needed) and slide inside the viewport.
 */
export function markerPlacement(
  marker: HTMLElement,
): "left-start" | "bottom-end" {
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - 32);
  // 12 px offset from the marker plus zag's default 8 px viewport padding.
  return marker.getBoundingClientRect().left >= width + 20
    ? "left-start"
    : "bottom-end";
}

/** Shared frame for the inline-marker and chapter-list popovers. */
function GapPopoverContent({
  lng,
  borderWidth,
  borderColor,
  arrow,
  children,
}: {
  lng: string;
  borderWidth: string;
  borderColor: string;
  arrow?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <PopoverContent
      w={`${POPOVER_WIDTH}px`}
      maxW="calc(100vw - 32px)"
      // zag measures the room on the side the popover opened on; the popover
      // never grows past it, and its body scrolls inside (see GapDetails).
      maxH="min(520px, var(--available-height, 75dvh))"
      overflow="hidden"
      borderStyle="solid"
      borderWidth={borderWidth}
      borderColor={borderColor}
      bg="base.light"
      boxShadow="3dp"
    >
      {arrow && <PopoverArrow />}
      <PopoverCloseTrigger
        aria-label={t("gap-close")}
        color="content.secondary"
      />
      <PopoverBody p={4} display="flex" flexDirection="column" minH={0}>
        {children}
      </PopoverBody>
    </PopoverContent>
  );
}

/** After "Answer in chat", focus the opened answer form instead of the gap. */
function answerFormFocus(answering: { current: boolean }) {
  return () => {
    if (!answering.current) return null;
    answering.current = false;
    return document.querySelector<HTMLElement>(
      '[data-testid="concept-note-gap-answer-heading"]',
    );
  };
}

export function ChapterGapMarker({
  chapter,
  lng,
  row,
  number,
  onAnswerGap,
}: GapDetailProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"left-start" | "bottom-end">(
    "left-start",
  );
  const answering = useRef(false);
  const critical = row.severity === "critical";
  return (
    <chakra.span
      float="right"
      clear="right"
      ml={2}
      mr={{ base: 0, md: "-40px" }}
      mb={1}
    >
      <PopoverRoot
        lazyMount
        open={open}
        onOpenChange={(details) => setOpen(details.open)}
        finalFocusEl={answerFormFocus(answering)}
        positioning={{
          placement,
          flip: true,
          offset: { mainAxis: 12 },
        }}
      >
        <PopoverTrigger asChild>
          <chakra.button
            type="button"
            data-testid="concept-note-gap-marker"
            data-gap-id={row.id}
            data-severity={row.severity}
            // React escapes attributes; i18next escaping would leak &#39; etc. into the label.
            aria-label={t("gap-marker-label", {
              number,
              severity: t(severityKey(row)),
              question: row.question,
              interpolation: { escapeValue: false },
            })}
            onClick={(event) =>
              setPlacement(markerPlacement(event.currentTarget))
            }
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            w="30px"
            h="30px"
            borderRadius="full"
            border="1px solid"
            borderColor={
              critical ? "sentiment.warningDefault" : "border.neutral"
            }
            bg={critical ? "sentiment.warningOverlay" : "gray.medium/20"}
            color={severityColor(row)}
            fontSize="label.sm"
            fontWeight="semibold"
            cursor="pointer"
            _hover={{ borderColor: "content.link" }}
            _open={{
              outline: "2px solid",
              outlineColor: severityBorder(row),
              outlineOffset: "3px",
            }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "content.link",
              outlineOffset: "2px",
            }}
          >
            {number}
          </chakra.button>
        </PopoverTrigger>
        <GapPopoverContent
          lng={lng}
          borderWidth="2px"
          borderColor={severityBorder(row)}
          arrow
        >
          <GapDetails
            lng={lng}
            row={row}
            number={number}
            onAnswer={
              onAnswerGap &&
              (() => {
                answering.current = true;
                setOpen(false);
                onAnswerGap(chapter, row);
              })
            }
          />
        </GapPopoverContent>
      </PopoverRoot>
    </chakra.span>
  );
}

/** The chapter count stays visible while questions open outside the document flow. */
export function ChapterGapsPanel({
  chapter,
  lng,
  rows,
  onAnswerGap,
}: ChapterGapsPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelected] = useState<string | null>(null);
  // Keyboard focus returns to the row whose details were just closed.
  const [returnId, setReturnId] = useState<string | null>(null);
  const answering = useRef(false);
  const selected = rows.find((row) => row.id === selectedId);
  if (!rows.length) return null;
  // Estimates stay listed, but they are not open gaps.
  const openRows = rows.filter((row) => !isEstimate(row));
  const required = openRows.filter((row) => row.severity === "critical").length;
  return (
    <Flex
      data-testid="concept-note-chapter-gaps"
      data-state={open ? "open" : "closed"}
      align="center"
      gap={2}
      flexWrap="wrap"
    >
      {/* The chapter header already counts estimates ("chapter-caveats"). */}
      {openRows.length > 0 && (
        <>
          <Text
            fontSize="label.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("chapter-open-gaps", { count: openRows.length })}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("gap-counts", {
              required,
              optional: openRows.length - required,
            })}
          </Text>
        </>
      )}
      <PopoverRoot
        lazyMount
        open={open}
        onOpenChange={(details) => {
          setOpen(details.open);
          if (!details.open) {
            setSelected(null);
            setReturnId(null);
          }
        }}
        positioning={{ placement: "bottom-end" }}
        finalFocusEl={answerFormFocus(answering)}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            color="content.link"
            textTransform="none"
            letterSpacing="normal"
            aria-label={t("gap-view-all-for-chapter", {
              chapter: chapter.title,
              interpolation: { escapeValue: false },
            })}
            data-testid="concept-note-chapter-gaps-toggle"
          >
            {t("gap-view-all")}
            <Icon as={LuChevronRight} />
          </Button>
        </PopoverTrigger>
        <GapPopoverContent
          lng={lng}
          borderWidth={selected ? "2px" : "1px"}
          borderColor={selected ? severityBorder(selected) : "border.neutral"}
        >
          {selected ? (
            <>
              <Button
                size="xs"
                variant="ghost"
                color="content.link"
                textTransform="none"
                letterSpacing="normal"
                alignSelf="start"
                mb={3}
                autoFocus
                data-testid="concept-note-gap-back"
                onClick={() => {
                  setReturnId(selected.id);
                  setSelected(null);
                }}
              >
                <Icon as={LuArrowLeft} />
                {t("gap-view-all")}
              </Button>
              <GapDetails
                lng={lng}
                row={selected}
                number={rows.indexOf(selected) + 1}
                onAnswer={
                  onAnswerGap &&
                  (() => {
                    answering.current = true;
                    setOpen(false);
                    setSelected(null);
                    onAnswerGap(chapter, selected);
                  })
                }
              />
            </>
          ) : (
            <>
              <PopoverTitle fontSize="body.sm" fontWeight="semibold" pr={6}>
                {t("chapter-open-gaps", { count: openRows.length })}
              </PopoverTitle>
              {/* The list scrolls inside the popover when the chapter has many gaps. */}
              <Box
                as="ol"
                listStyleType="none"
                mt={3}
                minH={0}
                overflowY="auto"
                css={scrollShadows}
              >
                {rows.map((row, index) => (
                  <Box
                    as="li"
                    key={row.id}
                    borderTop="1px solid"
                    borderColor="border.neutral"
                  >
                    <chakra.button
                      type="button"
                      w="full"
                      display="flex"
                      alignItems="start"
                      gap={2}
                      py={3}
                      textAlign="left"
                      cursor="pointer"
                      autoFocus={row.id === returnId}
                      data-testid="concept-note-gap-list-item"
                      data-severity={row.severity}
                      onClick={() => setSelected(row.id)}
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "content.link",
                        // Inset, so the scrolling list does not clip the ring.
                        outlineOffset: "-2px",
                      }}
                    >
                      <Text
                        as="span"
                        fontSize="label.sm"
                        color={severityColor(row)}
                      >
                        {index + 1}
                      </Text>
                      {/* The question tells gaps under one heading apart; the heading says where it is. */}
                      <Box flex={1} minW={0}>
                        <Text
                          fontSize="body.sm"
                          lineClamp={2}
                          data-testid="concept-note-gap-list-question"
                        >
                          {row.question}
                        </Text>
                        <Text
                          mt={1}
                          fontSize="label.sm"
                          color={
                            isEstimate(row)
                              ? "sentiment.warningFg"
                              : "content.tertiary"
                          }
                          lineClamp={1}
                        >
                          {t(
                            isEstimate(row)
                              ? "gap-state-caveat"
                              : severityKey(row),
                          )}
                          {row.gap?.answered_so_far &&
                            ` · ${t("gap-answered-so-far")}`}
                          {row.title && (
                            <>
                              {" · "}
                              {row.title}
                            </>
                          )}
                        </Text>
                      </Box>
                      <Icon
                        as={LuChevronRight}
                        mt={1}
                        color="content.tertiary"
                      />
                    </chakra.button>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </GapPopoverContent>
      </PopoverRoot>
    </Flex>
  );
}
