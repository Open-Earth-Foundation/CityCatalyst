"use client";

import { Box, Flex, Icon, Text, chakra } from "@chakra-ui/react";
import { useState } from "react";
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

export function chapterGapRows(
  chapter: ConceptNoteDraftChapter,
  markerMessages: string[],
): ChapterGapRow[] {
  const rows: ChapterGapRow[] = chapter.gaps
    .filter((gap) => gap.state === "open" || gap.state === "processing")
    .map((gap) => ({
      id: gap.gap_id,
      question: gap.question,
      whyAsking: gap.why_asking,
      severity: gap.severity,
      gap,
    }));
  for (const message of markerMessages) {
    if (
      !chapter.gaps.some(
        (gap) => questionText(gap.question) === questionText(message),
      ) &&
      !rows.some((row) => questionText(row.question) === questionText(message))
    ) {
      rows.push({
        id: "marker-" + rows.length,
        question: message.replace(/^information needed:\s*/i, "").trim(),
        severity: "critical",
        gap: null,
      });
    }
  }
  const markdown = chapter.body_markdown ?? "";
  const markers = missingInformationRanges(markdown);
  for (const row of rows) {
    const marker = markers.find(
      (item) => questionText(item.message) === questionText(row.question),
    );
    if (marker) {
      row.title = markdown
        .slice(0, marker.start)
        .match(/^#{1,6}\s+(.+)$/gm)
        ?.at(-1)
        ?.replace(/^#{1,6}\s+/, "")
        .trim();
    }
  }
  const position = (row: ChapterGapRow) => {
    const index = markerMessages.findIndex(
      (message) => questionText(message) === questionText(row.question),
    );
    return index < 0 ? markerMessages.length : index;
  };
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

function GapDetails({
  chapter,
  lng,
  row,
  number,
  onAnswerGap,
}: GapDetailProps) {
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
        color={
          row.severity === "critical"
            ? "sentiment.warningFg"
            : "content.secondary"
        }
      >
        <chakra.span data-testid="concept-note-gap-number">
          {t("gap-number", { number })}
        </chakra.span>
        {" · "}
        {t(
          row.severity === "critical"
            ? "gap-severity-critical"
            : "gap-severity-noncritical",
        )}
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
      {onAnswerGap && (
        <Button
          mt={4}
          w="full"
          size="sm"
          variant="outline"
          data-testid="concept-note-chapter-gap-answer"
          onClick={() => onAnswerGap(chapter, row)}
        >
          <Icon as={LuMessageSquare} />
          {t("gap-answer-in-chat")}
        </Button>
      )}
    </Box>
  );
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
              severity: t(
                row.severity === "critical"
                  ? "gap-severity-critical"
                  : "gap-severity-noncritical",
              ),
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
              row.severity === "critical"
                ? "sentiment.warningDefault"
                : "border.neutral"
            }
            bg={
              row.severity === "critical"
                ? "sentiment.warningOverlay"
                : "gray.medium/20"
            }
            color={
              row.severity === "critical"
                ? "sentiment.warningFg"
                : "content.secondary"
            }
            fontSize="label.sm"
            fontWeight="semibold"
            cursor="pointer"
            _hover={{ borderColor: "content.link" }}
            _open={{
              outline: "2px solid",
              outlineColor:
                row.severity === "critical"
                  ? "sentiment.warningDefault"
                  : "gray.medium",
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
        <PopoverContent
          w="360px"
          maxW="calc(100vw - 32px)"
          maxH="min(520px, 75dvh)"
          overflowY="auto"
          border="2px solid"
          borderColor={
            row.severity === "critical"
              ? "sentiment.warningDefault"
              : "gray.medium"
          }
          bg="base.light"
          boxShadow="3dp"
        >
          <PopoverArrow />
          <PopoverCloseTrigger
            aria-label={t("gap-close")}
            color="content.secondary"
          />
          <PopoverBody p={4}>
            <GapDetails
              chapter={chapter}
              lng={lng}
              row={row}
              number={number}
              onAnswerGap={
                onAnswerGap
                  ? (currentChapter, currentRow) => {
                      setOpen(false);
                      onAnswerGap(currentChapter, currentRow);
                    }
                  : undefined
              }
            />
          </PopoverBody>
        </PopoverContent>
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
          if (!details.open) setSelected(null);
        }}
        positioning={{ placement: "bottom-end" }}
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
        <PopoverContent
          w="360px"
          maxW="calc(100vw - 32px)"
          maxH="min(520px, 75dvh)"
          overflowY="auto"
          borderWidth={selected ? "2px" : "1px"}
          borderColor={
            selected
              ? selected.severity === "critical"
                ? "sentiment.warningDefault"
                : "gray.medium"
              : "border.neutral"
          }
          bg="base.light"
          boxShadow="3dp"
        >
          <PopoverCloseTrigger
            aria-label={t("gap-close")}
            color="content.secondary"
          />
          <PopoverBody p={4}>
            {selected ? (
              <>
                <Button
                  size="xs"
                  variant="ghost"
                  color="content.link"
                  textTransform="none"
                  letterSpacing="normal"
                  mb={3}
                  onClick={() => setSelected(null)}
                >
                  <Icon as={LuArrowLeft} />
                  {t("gap-view-all")}
                </Button>
                <GapDetails
                  chapter={chapter}
                  lng={lng}
                  row={selected}
                  number={rows.indexOf(selected) + 1}
                  onAnswerGap={
                    onAnswerGap
                      ? (currentChapter, currentRow) => {
                          setOpen(false);
                          setSelected(null);
                          onAnswerGap(currentChapter, currentRow);
                        }
                      : undefined
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
                          color={
                            row.severity === "critical"
                              ? "sentiment.warningFg"
                              : "content.secondary"
                          }
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
                            {t(
                              row.severity === "critical"
                                ? "gap-severity-critical"
                                : "gap-severity-noncritical",
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
          </PopoverBody>
        </PopoverContent>
      </PopoverRoot>
    </Flex>
  );
}
