"use client";

import { Box, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteProgress, ConceptNoteReasoning } from "./chat-utils";

export function ChatProgress({
  lng,
  progress,
  reasoning = [],
  isGenerating,
  markdownComponents,
}: {
  lng: string;
  progress: ConceptNoteProgress[];
  reasoning?: ConceptNoteReasoning[];
  isGenerating: boolean;
  markdownComponents: Components;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!isGenerating) return null;
  const latest = progress.at(-1);
  if (!reasoning.length) {
    return isGenerating ? (
      <HStack
        role="status"
        gap={2}
        py={2}
        data-testid="concept-note-chat-progress"
      >
        <Spinner size="xs" aria-hidden="true" />
        <Text fontSize="body.sm" color="content.secondary">
          {latest
            ? t(`chat-progress-${latest.stage}`, {
                chapter: latest.chapterTitle || t("chat-progress-chapter"),
              })
            : t("chat-progress-title")}
        </Text>
      </HStack>
    ) : null;
  }
  return (
    <Box
      mb={3}
      fontSize="body.sm"
      color="content.secondary"
      data-testid="concept-note-reasoning"
    >
      <HStack py={2} fontWeight="semibold">
        <Spinner size="xs" aria-hidden="true" />
        {t("chat-reasoning-title")}
      </HStack>
      <VStack align="stretch" gap={4} pt={2}>
        {reasoning.map((item) => (
          <Box key={item.id}>
            <Text fontSize="label.sm" fontWeight="semibold" mb={1}>
              {t(`chat-reasoning-${item.stage}`)}
              {item.chapterTitle ? ` / ${item.chapterTitle}` : ""}
            </Text>
            <Box overflowWrap="anywhere" lineHeight="22px">
              <ReactMarkdown components={markdownComponents}>
                {item.text}
              </ReactMarkdown>
            </Box>
          </Box>
        ))}
      </VStack>
    </Box>
  );
}
