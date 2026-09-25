"use client";

import { Box, HStack, Icon, Spinner, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuCheck } from "react-icons/lu";

import { useTranslation } from "@/i18n/client";
import type { ConceptNoteDraftState } from "@/util/types";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isDraftingInProgress(
  draft:
    | Pick<ConceptNoteDraftState, "status" | "overview_pending">
    | null
    | undefined,
): boolean {
  return (
    draft?.status === "running" ||
    (draft?.status === "complete" && Boolean(draft.overview_pending))
  );
}

/**
 * Chat-rail card shown while Clima drafts chapters (and until the drafting
 * overview message arrives). Reads only what the draft endpoint already
 * returns; timing comes from the run's progress summary.
 */
export function DraftingProgressCard({
  draft,
  lng,
  startedAt,
  completedAt,
}: {
  draft: ConceptNoteDraftState;
  lng: string;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isDraftingInProgress(draft)) return null;

  const running = draft.status === "running";
  const chapters = [...draft.chapters].sort((a, b) => a.position - b.position);
  const total = draft.total_chapters || chapters.length;
  const completed = running
    ? Math.min(Math.max(draft.completed_chapters, 0), total)
    : total;
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  // Once chapters are done the clock freezes at the drafting end time.
  const endMs = !running && completedAt ? Date.parse(completedAt) : now;
  const elapsed = Number.isFinite(startedMs)
    ? formatElapsed((Number.isFinite(endMs) ? endMs : now) - startedMs)
    : null;
  const progressLabel = t("drafting-card-progress", { completed, total });

  return (
    <Box
      role="status"
      aria-live="polite"
      alignSelf="start"
      w="full"
      maxW="92%"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      px={3}
      py={3}
      data-testid="concept-note-drafting-card"
    >
      <HStack gap={3} align="start">
        <Spinner
          size="sm"
          mt={0.5}
          flexShrink={0}
          color="interactive.primary/70"
          aria-hidden="true"
        />
        <Box minW={0} flex={1}>
          <Text fontSize="13px" fontWeight="semibold" color="content.primary">
            {t(
              running
                ? "drafting-card-title"
                : "drafting-card-summarising-title",
            )}
          </Text>
          <Text
            fontSize="12px"
            color="content.primary/65"
            mt={0.5}
            data-testid="concept-note-drafting-progress"
          >
            {running ? progressLabel : t("drafting-card-summarising")}
            {elapsed ? ` · ${elapsed}` : ""}
          </Text>
        </Box>
      </HStack>

      <Box
        role="progressbar"
        aria-label={t("drafting-card-title")}
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
          w={total > 0 ? `${(completed / total) * 100}%` : "0%"}
          bg="interactive.primary/60"
          borderRadius="full"
          transition="width 300ms ease"
        />
      </Box>

      {chapters.length > 0 && (
        <VStack
          as="ol"
          align="stretch"
          gap={1.5}
          mt={3}
          listStyleType="none"
          data-testid="concept-note-drafting-chapters"
        >
          {chapters.map((chapter) => {
            const done =
              !running ||
              chapter.status !== "empty" ||
              Boolean(chapter.body_markdown);
            const current =
              running &&
              !done &&
              chapter.chapter_id === draft.current_chapter_id;
            return (
              <HStack
                as="li"
                key={chapter.chapter_id}
                gap={2}
                align="center"
                data-state={done ? "done" : current ? "current" : "pending"}
              >
                {done ? (
                  <Icon
                    as={LuCheck}
                    boxSize={3.5}
                    flexShrink={0}
                    color="sentiment.positiveDefault"
                    aria-label={t("drafting-card-done")}
                  />
                ) : current ? (
                  <Spinner
                    size="xs"
                    flexShrink={0}
                    color="interactive.primary/70"
                    aria-label={t("drafting-card-writing")}
                  />
                ) : (
                  <Box
                    boxSize="14px"
                    flexShrink={0}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    aria-label={t("drafting-card-pending")}
                  >
                    <Box
                      boxSize="6px"
                      borderRadius="full"
                      bg="content.tertiary"
                    />
                  </Box>
                )}
                <Text
                  fontSize="12px"
                  lineClamp={1}
                  color={
                    current
                      ? "content.primary"
                      : done
                        ? "content.secondary"
                        : "content.tertiary"
                  }
                  fontWeight={current ? "semibold" : "normal"}
                >
                  {chapter.title}
                </Text>
                {current && (
                  <Text
                    fontSize="12px"
                    fontStyle="italic"
                    color="content.primary/65"
                    flexShrink={0}
                  >
                    {t("drafting-card-writing")}
                  </Text>
                )}
              </HStack>
            );
          })}
        </VStack>
      )}
    </Box>
  );
}
