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
import { missingInformationRanges } from "./draft-markdown";
import { markerLabel } from "./missing-information";

export interface ChapterGapRow {
  id: string;
  question: string;
  title?: string;
  whyAsking?: string;
  severity: "critical" | "noncritical";
  gap: ConceptNoteGap | null;
}

function questionText(value: string): string {
  return value
    .replace(/^information needed:\s*/i, "")
    .trim()
    .toLowerCase();
}

/** Open gaps plus unrecorded markers, in document order, titled by their heading. */
export function chapterGapRows(
  chapter: ConceptNoteDraftChapter,
): ChapterGapRow[] {
  const markdown = chapter.body_markdown ?? "";
  const markers = missingInformationRanges(markdown);
  const keys = markers.map((marker) => questionText(marker.message));
  const rows: ChapterGapRow[] = chapter.gaps
    .filter((gap) => gap.state === "open" || gap.state === "processing")
    .map((gap) => ({
      id: gap.gap_id,
      question: gap.question,
      whyAsking: gap.why_asking,
      severity: gap.severity,
      gap,
    }));
  // Resolved gaps keep their markers out; legacy markers get their own row.
  for (const { message } of markers) {
    const key = questionText(message);
    if (
      ![...chapter.gaps, ...rows].some(
        (item) => questionText(item.question) === key,
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
    const index = keys.indexOf(questionText(row.question));
    return index < 0 ? keys.length : index;
  };
  for (const row of rows) {
    const marker = markers[position(row)];
    if (marker)
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
  return rows.find(
    (row) => questionText(row.question) === questionText(message),
  );
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
  return (
    <Box data-testid="concept-note-chapter-gap" data-severity={row.severity}>
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
        {t(severityKey(row))}
      </Text>
      <Text mt={3} fontSize="body.sm" lineHeight="22px" color="content.primary">
        {row.question}
      </Text>
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
      {onAnswer && (
        <Button
          mt={4}
          w="full"
          size="sm"
          variant="outline"
          data-testid="concept-note-chapter-gap-answer"
          onClick={onAnswer}
        >
          <Icon as={LuMessageSquare} />
          {t("gap-answer-in-chat")}
        </Button>
      )}
    </Box>
  );
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
      w="360px"
      maxW="calc(100vw - 32px)"
      maxH="min(520px, 75dvh)"
      overflowY="auto"
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
      <PopoverBody p={4}>{children}</PopoverBody>
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
          placement: "left-start",
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
            aria-label={t("gap-marker-label", {
              number,
              severity: t(severityKey(row)),
              question: row.question,
            })}
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
  const required = rows.filter((row) => row.severity === "critical").length;
  return (
    <Flex
      data-testid="concept-note-chapter-gaps"
      data-state={open ? "open" : "closed"}
      align="center"
      gap={2}
      flexWrap="wrap"
    >
      <Text fontSize="label.sm" fontWeight="semibold" color="content.primary">
        {t("chapter-open-gaps", { count: rows.length })}
      </Text>
      <Text fontSize="label.sm" color="content.tertiary">
        {t("gap-counts", { required, optional: rows.length - required })}
      </Text>
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
                {t("chapter-open-gaps", { count: rows.length })}
              </PopoverTitle>
              <Box as="ol" listStyleType="none" mt={3}>
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
                      }}
                    >
                      <Text
                        as="span"
                        fontSize="label.sm"
                        color={severityColor(row)}
                      >
                        {index + 1}
                      </Text>
                      <Box flex={1} minW={0}>
                        <Text fontSize="body.sm" lineClamp={2}>
                          {row.title || markerLabel(row.question)}
                        </Text>
                        <Text
                          mt={1}
                          fontSize="label.sm"
                          color="content.tertiary"
                        >
                          {t(severityKey(row))}
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
