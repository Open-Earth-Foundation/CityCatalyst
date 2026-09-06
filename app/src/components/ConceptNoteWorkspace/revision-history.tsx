"use client";

import { useEffect, useRef, useState } from "react";
import { Box, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { LuHistory } from "react-icons/lu";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import { getEditHistory } from "@/services/concept-note-edit-api";
import type {
  EditHistoryEntry,
  EditProposal,
} from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";
import type { HistoryReview } from "./inline-review";

interface HistoryProps {
  runId: string;
  entries: EditHistoryEntry[];
  chapters: ConceptNoteDraftChapter[];
  lng: string;
  busy: boolean;
  error?: string | null;
  onLoadOlder: (beforeSequence: number) => Promise<void>;
  onReview: (review: HistoryReview) => void;
  completedProposals?: EditProposal[];
}

/** Chat contains the history index only; all comparison and confirmation is in the document. */
export function RevisionHistory({
  runId,
  entries,
  chapters,
  lng,
  busy,
  error,
  onLoadOlder,
  onReview,
  completedProposals = [],
}: HistoryProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState(false);
  const requestSequence = useRef(0);
  const activeRun = useRef<string | null>(runId);
  useEffect(() => {
    activeRun.current = runId;
    return () => {
      activeRun.current = null;
    };
  }, [runId]);

  async function inspect(
    entry: EditHistoryEntry,
    operation: "undo" | "restore",
  ): Promise<void> {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setReadError(false);
    // Freeze current revisions before the read; never rebase at confirmation time.
    const expected: Record<string, number> = {};
    const before: Record<string, string> = {};
    for (const id of Object.keys(entry.after_revisions)) {
      const chapter = chapters.find((current) => current.chapter_id === id);
      if (
        !chapter?.revision_number ||
        typeof chapter.body_markdown !== "string"
      ) {
        setReadError(true);
        setLoading(false);
        return;
      }
      expected[id] = chapter.revision_number;
      before[id] = chapter.body_markdown;
    }
    try {
      const detail = await getEditHistory(runId, entry.application_id);
      if (
        detail.run_id !== runId ||
        detail.application_id !== entry.application_id ||
        detail.chapters.length !== Object.keys(expected).length ||
        new Set(detail.chapters.map((chapter) => chapter.chapter_id)).size !==
          detail.chapters.length ||
        detail.chapters.some((chapter) => !(chapter.chapter_id in expected))
      )
        throw new Error("History scope mismatch");
      if (activeRun.current === runId && sequence === requestSequence.current)
        onReview({ entry: detail, operation, expected, before });
    } catch {
      if (activeRun.current === runId) setReadError(true);
    } finally {
      if (activeRun.current === runId) setLoading(false);
    }
  }

  return (
    <Box
      borderTop="1px solid"
      borderColor="border.neutral"
      pt={3}
      data-testid="concept-note-revision-history"
    >
      <Button
        type="button"
        size="sm"
        minH="44px"
        variant="ghost"
        color="content.secondary"
        aria-expanded={open}
        data-testid="concept-note-history-toggle"
        onClick={() => setOpen(!open)}
      >
        <Icon as={LuHistory} />
        {t("edit-history-title")}
      </Button>
      {open && (
        <VStack align="stretch" gap={3} mt={2}>
          {completedProposals.map((proposal) => (
            <HStack
              key={proposal.proposal_id}
              data-testid="concept-note-edit-completed"
              data-proposal-id={proposal.proposal_id}
              justify="space-between"
              gap={2}
            >
              <Text
                fontSize="label.sm"
                color="content.secondary"
                lineClamp={1}
                title={proposal.instruction}
              >
                {proposal.instruction}
              </Text>
              <Text
                fontSize="label.sm"
                flexShrink={0}
                role="status"
                data-testid="concept-note-edit-status"
              >
                {t(`edit-status-${proposal.status}`)}
              </Text>
            </HStack>
          ))}
          {(error || readError) && (
            <Text role="alert" fontSize="label.sm">
              {t("edit-history-error")}
            </Text>
          )}
          {entries.length === 0 && (
            <Text fontSize="label.sm" color="content.secondary">
              {t("edit-history-empty")}
            </Text>
          )}
          {entries.map((entry, index) => (
            <Box
              key={entry.application_id}
              data-revision-id={entry.application_id}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              p={3}
            >
              <Text fontSize="label.sm" fontWeight="semibold">
                {t("edit-history-entry", {
                  sequence: entry.sequence,
                  operation: t(`edit-history-operation-${entry.operation}`),
                })}
              </Text>
              <Text fontSize="label.sm" color="content.secondary">
                {new Intl.DateTimeFormat(lng, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(entry.created_at))}
              </Text>
              <HStack gap={2} flexWrap="wrap" mt={2}>
                <Button
                  size="xs"
                  minH="44px"
                  variant="outline"
                  disabled={busy || loading}
                  loading={loading}
                  data-testid="concept-note-history-review"
                  onClick={() => void inspect(entry, "restore")}
                >
                  {t("edit-history-review")}
                </Button>
                {index === 0 && (
                  <Button
                    size="xs"
                    minH="44px"
                    variant="outline"
                    disabled={busy || loading}
                    data-testid="concept-note-history-undo"
                    onClick={() => void inspect(entry, "undo")}
                  >
                    {t("edit-history-undo")}
                  </Button>
                )}
              </HStack>
            </Box>
          ))}
          {entries.length > 0 && entries[entries.length - 1].sequence > 1 && (
            <Button
              size="xs"
              minH="44px"
              variant="ghost"
              color="content.link"
              disabled={busy || loading}
              data-testid="concept-note-history-older"
              onClick={() =>
                void onLoadOlder(entries[entries.length - 1].sequence)
              }
            >
              {t("edit-history-older")}
            </Button>
          )}
        </VStack>
      )}
    </Box>
  );
}
