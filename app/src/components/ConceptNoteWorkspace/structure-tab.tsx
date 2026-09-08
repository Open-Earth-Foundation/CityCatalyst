"use client";

import { useState } from "react";

import { Box, Flex, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuArrowDown,
  LuArrowUp,
  LuCheck,
  LuGripVertical,
  LuInfo,
  LuLock,
  LuPlus,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
} from "@/util/types";

const initialChapterKeys = [
  "chapter-project-summary",
  "chapter-context-rationale",
  "chapter-objectives",
  "chapter-theory-of-change",
  "chapter-project-components",
  "chapter-implementation",
  "chapter-climate-impact",
  "chapter-environmental-social",
  "chapter-gender-inclusion",
  "chapter-financing",
  "chapter-risk-management",
  "chapter-monitoring-evaluation",
] as const;

interface StructureChapter {
  id: string;
  required: boolean;
  title: string | null;
  translationKey: string | null;
}

interface ChapterOrderState {
  chapters: StructureChapter[];
  sourceId: string;
}

interface StructureTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
  draft: ConceptNoteDraftState | null;
  lng: string;
}

function chapterStatusTranslationKey(
  status: ConceptNoteDraftChapter["status"] | null,
): string {
  switch (status) {
    case "draft":
      return "chapter-status-draft";
    case "needs_review":
      return "chapter-status-needs-review";
    case "ready":
      return "chapter-status-ready";
    case "empty":
    default:
      return "not-started";
  }
}

function chapterStatusColor(
  status: ConceptNoteDraftChapter["status"] | null,
): string {
  switch (status) {
    case "ready":
      return "sentiment.positiveDefault";
    case "needs_review":
      return "sentiment.warningDefault";
    case "draft":
      return "content.link";
    case "empty":
    default:
      return "content.tertiary";
  }
}

function defaultChapters(): StructureChapter[] {
  return initialChapterKeys.map((translationKey, index) => ({
    id: translationKey,
    required: index < 2,
    title: null,
    translationKey,
  }));
}

function chaptersFromTemplate(
  applicationContext: ConceptNoteApplicationContext | null,
): StructureChapter[] {
  const templateChapters = applicationContext?.template?.chapter_schema;
  if (!templateChapters?.length) {
    return defaultChapters();
  }

  return templateChapters.map((chapter) => ({
    id: chapter.chapter_ref,
    required: chapter.required === true,
    title: chapter.title,
    translationKey: null,
  }));
}

export function StructureTab({
  applicationContext,
  draft,
  lng,
}: StructureTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const sourceId = applicationContext?.template?.id ?? "default";
  const sourceChapters = chaptersFromTemplate(applicationContext);
  const [chapterOrder, setChapterOrder] = useState<ChapterOrderState | null>(
    null,
  );
  const chapters =
    chapterOrder?.sourceId === sourceId
      ? chapterOrder.chapters
      : sourceChapters;
  const draftChapterBySection = new Map(
    (draft?.chapters ?? []).map((chapter) => [
      chapter.template_section_id ?? chapter.chapter_id,
      chapter,
    ]),
  );

  function moveChapter(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= chapters.length) {
      return;
    }
    const reordered = [...chapters];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    setChapterOrder({ chapters: reordered, sourceId });
  }

  return (
    <VStack align="stretch" gap={5} p={{ base: 4, md: 6 }}>
      <Flex
        align={{ base: "start", md: "center" }}
        justify="space-between"
        direction={{ base: "column", md: "row" }}
        gap={3}
      >
        <Box>
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("structure-title")}
          </Text>
          <Text mt={1} fontSize="body.sm" color="content.tertiary">
            {applicationContext?.template
              ? t("structure-template-description", {
                  template: applicationContext.template.name,
                })
              : t("structure-description")}
          </Text>
        </Box>
        <HStack
          gap={2}
          border="1px solid"
          borderColor={
            applicationContext?.template
              ? "sentiment.positiveDefault"
              : "sentiment.warningDefault"
          }
          borderRadius="pill"
          bg={
            applicationContext?.template
              ? "sentiment.positiveOverlay"
              : "sentiment.warningOverlay"
          }
          px={3}
          py={1.5}
        >
          <Icon
            as={applicationContext?.template ? LuCheck : LuInfo}
            color={
              applicationContext?.template
                ? "sentiment.positiveDefault"
                : "sentiment.warningDefault"
            }
          />
          <Text fontSize="label.sm" color="content.secondary">
            {t(
              applicationContext?.template ? "template-ready" : "preview-only",
            )}
          </Text>
        </HStack>
      </Flex>

      <Box
        border="1px solid"
        borderColor="sentiment.warningDefault"
        borderRadius="rounded"
        bg="sentiment.warningOverlay"
        p={4}
      >
        <Text fontSize="body.sm" lineHeight="22px" color="content.secondary">
          {t(
            applicationContext?.template
              ? "structure-save-note"
              : "structure-backend-note",
          )}
        </Text>
      </Box>

      <VStack align="stretch" gap={2}>
        {chapters.map((chapter, index) => {
          const draftChapter =
            draftChapterBySection.get(chapter.id) ??
            draft?.chapters?.find(
              (item) => item.position === index || item.position === index + 1,
            ) ??
            null;
          const chapterLabel = chapter.title
            ? chapter.title
            : chapter.translationKey
              ? t(chapter.translationKey)
              : t("custom-chapter", { number: index + 1 });
          const runtimeStatus = draftChapter?.status ?? null;
          const runtimeStatusColor = chapterStatusColor(runtimeStatus);

          return (
            <Flex
              key={chapter.id}
              align="center"
              gap={3}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              px={3}
              py={3}
              boxShadow="1dp"
            >
              <Icon as={LuGripVertical} color="content.tertiary" />
              <Flex
                boxSize="28px"
                align="center"
                justify="center"
                borderRadius="full"
                bg="background.neutral"
              >
                <Text
                  fontSize="label.sm"
                  fontWeight="semibold"
                  color="content.secondary"
                >
                  {index + 1}
                </Text>
              </Flex>
              <Box minW={0} flex={1}>
                <Text
                  fontFamily="heading"
                  fontSize="body.sm"
                  fontWeight="semibold"
                  color="content.primary"
                >
                  {chapterLabel}
                </Text>
                <HStack mt={1} gap={2}>
                  <Box
                    boxSize="6px"
                    borderRadius="full"
                    bg={runtimeStatusColor}
                  />
                  <Text fontSize="label.sm" color="content.tertiary">
                    {t(chapterStatusTranslationKey(runtimeStatus))}
                  </Text>
                  {draftChapter && draftChapter.open_gap_count > 0 && (
                    <Text fontSize="label.sm" color="sentiment.warningDefault">
                      {t("chapter-open-gaps", {
                        count: draftChapter.open_gap_count,
                      })}
                    </Text>
                  )}
                  {draftChapter && draftChapter.caveat_count > 0 && (
                    <Text fontSize="label.sm" color="content.tertiary">
                      {t("chapter-caveats", {
                        count: draftChapter.caveat_count,
                      })}
                    </Text>
                  )}
                  {chapter.required && (
                    <HStack gap={1} color="content.tertiary">
                      <Icon as={LuLock} boxSize={3} />
                      <Text fontSize="label.sm">{t("required")}</Text>
                    </HStack>
                  )}
                </HStack>
              </Box>
              <HStack gap={1}>
                <Button
                  size="xs"
                  variant="ghost"
                  color="content.link"
                  _hover={{ color: "content.link" }}
                  disabled={index === 0}
                  aria-label={t("move-chapter-up", { chapter: chapterLabel })}
                  onClick={() => moveChapter(index, -1)}
                >
                  <Icon as={LuArrowUp} />
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  color="content.link"
                  _hover={{ color: "content.link" }}
                  disabled={index === chapters.length - 1}
                  aria-label={t("move-chapter-down", { chapter: chapterLabel })}
                  onClick={() => moveChapter(index, 1)}
                >
                  <Icon as={LuArrowDown} />
                </Button>
              </HStack>
            </Flex>
          );
        })}
      </VStack>

      <Button
        size="sm"
        variant="outline"
        alignSelf="start"
        onClick={() =>
          setChapterOrder({
            chapters: [
              ...chapters,
              {
                id: `custom-chapter-${chapters.length + 1}`,
                required: false,
                title: null,
                translationKey: null,
              },
            ],
            sourceId,
          })
        }
      >
        <Icon as={LuPlus} />
        {t("add-custom-chapter")}
      </Button>
    </VStack>
  );
}
