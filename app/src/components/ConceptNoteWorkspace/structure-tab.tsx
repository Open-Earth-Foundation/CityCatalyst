"use client";

import { useState } from "react";

import { Box, Flex, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuArrowDown,
  LuArrowUp,
  LuGripVertical,
  LuInfo,
  LuLock,
  LuPlus,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

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

interface StructureTabProps {
  lng: string;
}

export function StructureTab({ lng }: StructureTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [chapters, setChapters] = useState<string[]>([...initialChapterKeys]);

  function moveChapter(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= chapters.length) {
      return;
    }
    setChapters((current) => {
      const reordered = [...current];
      [reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ];
      return reordered;
    });
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
            {t("structure-description")}
          </Text>
        </Box>
        <HStack
          gap={2}
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="pill"
          bg="sentiment.warningOverlay"
          px={3}
          py={1.5}
        >
          <Icon as={LuInfo} color="sentiment.warningDefault" />
          <Text fontSize="label.sm" color="content.secondary">
            {t("preview-only")}
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
          {t("structure-backend-note")}
        </Text>
      </Box>

      <VStack align="stretch" gap={2}>
        {chapters.map((chapter, index) => {
          const chapterLabel = chapter.startsWith("custom-chapter-")
            ? t("custom-chapter", { number: index + 1 })
            : t(chapter);

          return (
            <Flex
              key={chapter}
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
                    bg="content.tertiary"
                  />
                  <Text fontSize="label.sm" color="content.tertiary">
                    {t("not-started")}
                  </Text>
                  {index < 2 && (
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
          setChapters((current) => [
            ...current,
            `custom-chapter-${current.length + 1}`,
          ])
        }
      >
        <Icon as={LuPlus} />
        {t("add-custom-chapter")}
      </Button>
    </VStack>
  );
}
