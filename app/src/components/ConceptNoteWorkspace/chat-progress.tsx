"use client";

import { Box, HStack, Icon, Spinner, Text } from "@chakra-ui/react";
import { LuChevronRight } from "react-icons/lu";
import type { Components } from "react-markdown";
import { useTranslation } from "@/i18n/client";
import { ChatMarkdown } from "./chat-markdown";
import { readReasoningPreview, type ConceptNoteReasoning } from "./chat-utils";

export function ChatProgress({
  lng,
  reasoning = [],
  isGenerating,
  markdownComponents,
}: {
  lng: string;
  reasoning?: ConceptNoteReasoning[];
  isGenerating: boolean;
  markdownComponents: Components;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!isGenerating) return null;
  const thought = reasoning.at(-1);
  const preview = thought ? readReasoningPreview(thought.text) : "";
  const label = (
    <>
      <Spinner size="xs" flexShrink={0} aria-hidden="true" />
      <Text
        as="span"
        minW={0}
        overflowWrap="anywhere"
        lineClamp={2}
        data-testid="concept-note-reasoning-preview"
      >
        {preview || t("chat-thinking")}
      </Text>
    </>
  );

  if (!thought)
    return (
      <HStack
        role="status"
        gap={2}
        py={2}
        color="content.secondary"
        fontSize="13px"
        data-testid="concept-note-chat-progress"
      >
        {label}
      </HStack>
    );

  return (
    <Box
      as="details"
      w="full"
      color="content.secondary"
      fontSize="13px"
      data-testid="concept-note-reasoning"
      css={{ "&[open] .reasoning-chevron": { transform: "rotate(90deg)" } }}
    >
      <Box
        as="summary"
        display="flex"
        alignItems="center"
        gap={2}
        py={2}
        cursor="pointer"
        listStyleType="none"
        borderRadius="sm"
        _hover={{ color: "content.primary" }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "interactive.primary",
          outlineOffset: "2px",
        }}
        css={{ "&::-webkit-details-marker": { display: "none" } }}
      >
        {label}
        <Icon
          as={LuChevronRight}
          className="reasoning-chevron"
          boxSize={3.5}
          flexShrink={0}
          aria-hidden="true"
        />
      </Box>
      <Box
        maxH="240px"
        overflowY="auto"
        overscrollBehavior="contain"
        borderLeftWidth="1px"
        borderColor="border.neutral"
        pl={3}
        ml="6px"
        mt={1}
        mb={2}
        data-testid="concept-note-reasoning-content"
      >
        {reasoning.map((item) => (
          <Box key={item.id} mb={3} _last={{ mb: 0 }}>
            {item.chapterTitle && (
              <Text fontSize="12px" mb={1}>
                {item.chapterTitle}
              </Text>
            )}
            <ChatMarkdown components={markdownComponents} isStreaming>
              {item.text}
            </ChatMarkdown>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
