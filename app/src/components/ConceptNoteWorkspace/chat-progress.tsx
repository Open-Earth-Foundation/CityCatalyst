"use client";

import { Box, HStack, Icon, Spinner, Text, chakra } from "@chakra-ui/react";
import { LuChevronRight } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type ConceptNoteReasoning,
  type ConceptNoteProgress,
} from "./chat-utils";

export function ChatProgress({
  lng,
  reasoning = [],
  progress = null,
  isGenerating,
}: {
  lng: string;
  reasoning?: ConceptNoteReasoning[];
  progress?: ConceptNoteProgress | null;
  isGenerating: boolean;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!isGenerating) return null;
  const thought = reasoning.at(-1);
  const activity = progress;
  const total = activity?.total ?? 0;
  const hasCount = activity?.completed !== undefined && total > 0;
  const completed = Math.min(Math.max(activity?.completed ?? 0, 0), total);
  const label = (
    <>
      <Spinner
        size="sm"
        flexShrink={0}
        color="interactive.primary/70"
        aria-hidden="true"
      />
      <Box minW={0} flex={1}>
        <Text
          as="span"
          minW={0}
          fontSize="13px"
          fontStyle="italic"
          overflowWrap="anywhere"
          lineClamp={2}
          data-testid="concept-note-reasoning-preview"
        >
          {thought ? t("chat-reasoning") : t("chat-thinking")}
        </Text>
        {activity && (
          <Text
            fontSize="12px"
            mt={1}
            data-testid="concept-note-workflow-progress"
          >
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
        {hasCount && (
          <Box
            role="progressbar"
            aria-label={t("chat-progress-title")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            h="4px"
            mt={3}
            bg="background.neutral"
            borderRadius="full"
            overflow="hidden"
          >
            <Box
              h="full"
              w={`${(completed / total) * 100}%`}
              bg="interactive.primary/60"
              borderRadius="full"
            />
          </Box>
        )}
      </Box>
    </>
  );

  if (!thought)
    return (
      <HStack
        role="status"
        gap={3}
        py={2}
        color="content.primary/65"
        fontSize="13px"
        fontStyle="italic"
        data-testid="concept-note-chat-progress"
      >
        {label}
      </HStack>
    );

  return (
    <chakra.details
      open
      w="full"
      color="content.primary/65"
      fontSize="13px"
      fontStyle="italic"
      lineHeight="1.7"
      data-testid="concept-note-reasoning"
      css={{ "&[open] .reasoning-chevron": { transform: "rotate(90deg)" } }}
    >
      <Box
        as="summary"
        display="flex"
        alignItems="center"
        gap={3}
        py={2}
        cursor="pointer"
        listStyleType="none"
        borderRadius="sm"
        _hover={{ bg: "background.neutral/30" }}
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
        borderLeftWidth="2px"
        borderColor="interactive.primary/30"
        pl={4}
        ml="7px"
        mt={3}
        mb={2}
        overflowWrap="anywhere"
        css={{
          "& :is(p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, table)": {
            marginBottom: "0.75rem",
          },
          "& :is(h1, h2, h3, h4, h5, h6, strong, b, th)": {
            fontSize: "inherit",
            fontWeight: "inherit",
          },
          "& :is(code, pre)": { fontFamily: "inherit", whiteSpace: "pre-wrap" },
          "& :is(ul, ol)": { paddingInlineStart: "1.25rem" },
          "& ul": { listStyleType: "disc" },
          "& ol": { listStyleType: "decimal" },
          "& a": { textDecoration: "underline" },
          "& > :last-child > :last-child": { marginBottom: 0 },
        }}
        data-testid="concept-note-reasoning-content"
      >
        {reasoning.map((item) => (
          <Box key={item.id} mb={3} _last={{ mb: 0 }}>
            {item.chapterTitle && (
              <Text fontSize="12px" mb={1}>
                {item.chapterTitle}
              </Text>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {item.text}
            </ReactMarkdown>
          </Box>
        ))}
      </Box>
    </chakra.details>
  );
}
