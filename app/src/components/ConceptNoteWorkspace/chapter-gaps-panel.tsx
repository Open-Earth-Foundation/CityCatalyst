"use client";

import { Box, Flex, HStack, Icon, Text, chakra } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronRight, LuCircleAlert, LuMessageSquare } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";

export interface ChapterGapRow {
  id: string;
  question: string;
  whyAsking?: string;
  severity: "critical" | "noncritical";
  gap: ConceptNoteGap | null;
}

/** Open gaps first; fall back to the drafter's inline markers when the run
 * has no gap records yet. */
export function chapterGapRows(
  chapter: ConceptNoteDraftChapter,
  markerMessages: string[],
): ChapterGapRow[] {
  const open = chapter.gaps.filter(
    (gap) => gap.state === "open" || gap.state === "processing",
  );
  if (open.length) {
    return open.map((gap) => ({
      id: gap.gap_id,
      question: gap.question,
      whyAsking: gap.why_asking,
      severity: gap.severity,
      gap,
    }));
  }
  return markerMessages.map((message, index) => ({
    id: `marker-${index}`,
    question: message.replace(/^information needed:\s*/i, "").trim(),
    severity: "critical",
    gap: null,
  }));
}

interface ChapterGapsPanelProps {
  chapter: ConceptNoteDraftChapter;
  lng: string;
  rows: ChapterGapRow[];
  onAnswerGap?: (chapter: ConceptNoteDraftChapter, row: ChapterGapRow) => void;
}

/**
 * One collapsed block per chapter listing what Clima still needs, with an
 * "Answer in chat" action per item. Replaces the column of bare markers.
 */
export function ChapterGapsPanel({
  chapter,
  lng,
  rows,
  onAnswerGap,
}: ChapterGapsPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const panelId = `chapter-gaps-${chapter.chapter_id}`;

  return (
    <Box
      mt={4}
      border="1px solid"
      borderColor="sentiment.warningDefault/50"
      borderRadius="rounded"
      bg="base.light"
      data-testid="concept-note-chapter-gaps"
      data-state={open ? "open" : "closed"}
    >
      <chakra.button
        type="button"
        w="full"
        display="flex"
        alignItems="center"
        gap={3}
        px={4}
        py={3}
        textAlign="left"
        cursor="pointer"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "content.link",
          outlineOffset: "2px",
        }}
        data-testid="concept-note-chapter-gaps-toggle"
      >
        <Icon
          as={LuCircleAlert}
          boxSize={4}
          flexShrink={0}
          color="sentiment.warningDefault"
        />
        <Box flex={1} minW={0}>
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("chapter-gaps-title", { count: rows.length })}
          </Text>
          <Text fontSize="label.sm" lineHeight="18px" color="content.secondary">
            {t("chapter-gaps-hint")}
          </Text>
        </Box>
        <Icon
          as={LuChevronRight}
          boxSize={4}
          flexShrink={0}
          color="content.tertiary"
          transform={open ? "rotate(90deg)" : undefined}
          transition="transform 150ms ease"
        />
      </chakra.button>

      {open && (
        <Box
          as="ol"
          id={panelId}
          listStyleType="none"
          borderTop="1px solid"
          borderColor="border.neutral"
        >
          {rows.map((row, index) => (
            <Flex
              as="li"
              key={row.id}
              align={{ base: "stretch", md: "center" }}
              direction={{ base: "column", md: "row" }}
              gap={3}
              px={4}
              py={3}
              borderTop={index === 0 ? "none" : "1px solid"}
              borderColor="border.neutral"
              data-testid="concept-note-chapter-gap"
              data-severity={row.severity}
            >
              <Box flex={1} minW={0}>
                <HStack gap={2} align="start">
                  <Text
                    as="span"
                    flexShrink={0}
                    mt="3px"
                    fontSize="10px"
                    lineHeight="14px"
                    px={1.5}
                    borderRadius="full"
                    border="1px solid"
                    borderColor={
                      row.severity === "critical"
                        ? "sentiment.warningDefault"
                        : "border.neutral"
                    }
                    color={
                      row.severity === "critical"
                        ? "sentiment.warningDefault"
                        : "content.tertiary"
                    }
                  >
                    {t(
                      row.severity === "critical"
                        ? "gap-severity-critical"
                        : "gap-severity-noncritical",
                    )}
                  </Text>
                  <Text
                    fontSize="body.sm"
                    lineHeight="22px"
                    color="content.primary"
                  >
                    {row.question}
                  </Text>
                </HStack>
                {row.whyAsking && (
                  <Text
                    mt={1}
                    fontSize="label.sm"
                    lineHeight="18px"
                    color="content.tertiary"
                  >
                    {row.whyAsking}
                  </Text>
                )}
              </Box>
              {onAnswerGap && (
                <Button
                  size="sm"
                  variant="outline"
                  flexShrink={0}
                  onClick={() => onAnswerGap(chapter, row)}
                  data-testid="concept-note-chapter-gap-answer"
                >
                  <Icon as={LuMessageSquare} />
                  {t("gap-answer-in-chat")}
                </Button>
              )}
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
}
