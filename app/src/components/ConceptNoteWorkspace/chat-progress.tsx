"use client";

import { Box, HStack, Icon, Spinner, Text } from "@chakra-ui/react";
import { LuChevronRight } from "react-icons/lu";
import type { Components } from "react-markdown";
import { useTranslation } from "@/i18n/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  readReasoningPreview,
  type ConceptNoteReasoning,
  type ConceptNoteProgress,
} from "./chat-utils";

export function ChatProgress({
  lng,
  reasoning = [],
  progress = [],
  isGenerating,
  markdownComponents,
}: {
  lng: string;
  reasoning?: ConceptNoteReasoning[];
  progress?: ConceptNoteProgress[];
  isGenerating: boolean;
  markdownComponents: Components;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!isGenerating) return null;
  const thought = reasoning.at(-1);
  const preview = thought ? readReasoningPreview(thought.text) : "";
  const activity = progress.at(-1);
  const label = (
    <>
      <Spinner size="xs" flexShrink={0} aria-hidden="true" />
      <Box minW={0}>
        <Text
          as="span"
          minW={0}
          fontSize="12px"
          fontStyle="italic"
          overflowWrap="anywhere"
          lineClamp={2}
          data-testid="concept-note-reasoning-preview"
        >
          {preview || t("chat-thinking")}
        </Text>
        {activity && (
          <Text fontSize="12px" data-testid="concept-note-workflow-progress">
            {t(
              activity.stage === "planning" && !activity.chapterTitle
                ? "chat-progress-searching"
                : `chat-progress-${activity.stage}`,
              {
                chapter: activity.chapterTitle || t("chat-progress-chapter"),
              },
            )}
            {activity.completed !== undefined &&
              activity.total !== undefined && (
                <>
                  {" "}
                  ·{" "}
                  {t("chat-progress-count", {
                    completed: activity.completed,
                    total: activity.total,
                  })}
                </>
              )}
          </Text>
        )}
      </Box>
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {item.text}
            </ReactMarkdown>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
