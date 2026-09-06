"use client";

import { Box, HStack, Icon, Text } from "@chakra-ui/react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import type { EditChange, EditProposal } from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";
import { EditProposalCard } from "./edit-proposal-card";
import {
  proposalMatchesDraft,
  snapshotChanges,
  type DocumentReview,
} from "./inline-review";
import type { useConceptNoteEdits } from "./use-concept-note-edits";

export type EditController = ReturnType<typeof useConceptNoteEdits>;

export function documentReviewChanges(
  review: DocumentReview | null,
  proposals: EditProposal[],
  chapters: ConceptNoteDraftChapter[],
): EditChange[] {
  if (!review) return [];
  if (review.kind === "proposal") {
    const proposal = proposals.find(
      (item) =>
        item.proposal_id === review.proposalId && item.status === "proposed",
    );
    return proposal && proposalMatchesDraft(proposal, chapters)
      ? [...proposal.changes].sort((a, b) => {
          const left =
            chapters.find((chapter) => chapter.chapter_id === a.chapter_id)
              ?.position ?? 0;
          const right =
            chapters.find((chapter) => chapter.chapter_id === b.chapter_id)
              ?.position ?? 0;
          return left - right || a.start - b.start;
        })
      : [];
  }
  return [...review.entry.chapters]
    .sort(
      (a, b) =>
        (chapters.find((chapter) => chapter.chapter_id === a.chapter_id)
          ?.position ?? 0) -
        (chapters.find((chapter) => chapter.chapter_id === b.chapter_id)
          ?.position ?? 0),
    )
    .flatMap((chapter) =>
      snapshotChanges(
        {
          chapter_id: chapter.chapter_id,
          title: chapter.chapter_title,
          revision_number: review.expected[chapter.chapter_id],
        },
        review.before[chapter.chapter_id],
        review.operation === "undo" ? chapter.before : chapter.after,
      ),
    );
}

interface Props {
  review: DocumentReview;
  chapters: ConceptNoteDraftChapter[];
  edits: EditController;
  changes: EditChange[];
  activeChangeId?: string;
  lng: string;
  onNavigate: (chapterId: string, changeId?: string) => void;
  onCancel: () => void;
  onOpenSources: () => void;
  isDocumentVisible?: boolean;
}

export function DocumentReviewToolbar({
  review,
  chapters,
  edits,
  changes,
  activeChangeId,
  lng,
  onNavigate,
  onCancel,
  onOpenSources,
  isDocumentVisible = true,
}: Props) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!isDocumentVisible && changes[0])
    return (
      <Button
        size="sm"
        minH="44px"
        variant="outline"
        data-testid="concept-note-review-return-to-draft"
        onClick={() => onNavigate(changes[0].chapter_id, changes[0].change_id)}
      >
        {t("edit-view-changes")}
      </Button>
    );
  if (review.kind === "proposal") {
    const proposal = edits.proposals.find(
      (item) => item.proposal_id === review.proposalId,
    );
    return proposal?.status === "proposed" ? (
      <EditProposalCard
        key={proposal.proposal_id}
        proposal={{
          ...proposal,
          changes: changes.length ? changes : proposal.changes,
        }}
        lng={lng}
        busy={Boolean(edits.busy)}
        onApply={edits.apply}
        onReject={edits.reject}
        onNavigate={onNavigate}
        activeChangeId={activeChangeId}
        canApply={proposalMatchesDraft(proposal, chapters)}
        onOpenSources={onOpenSources}
        onRefine={edits.refine}
      />
    ) : null;
  }
  const index = Math.max(
    0,
    changes.findIndex((change) => change.change_id === activeChangeId),
  );
  const stale = Object.entries(review.expected).some(([id, revision]) => {
    const chapter = chapters.find((item) => item.chapter_id === id);
    return (
      chapter?.revision_number !== revision ||
      chapter.body_markdown !== review.before[id]
    );
  });
  const navigate = (next: number) =>
    onNavigate(changes[next].chapter_id, changes[next].change_id);
  return (
    <Box data-testid="concept-note-document-review" bg="base.light" minW={0}>
      <HStack
        flexWrap="wrap"
        gap={2}
        data-testid="concept-note-history-preview"
      >
        {stale && (
          <Text role="alert" fontSize="label.sm">
            {t("edit-inline-stale")}
          </Text>
        )}
        {!changes.length && (
          <Text fontSize="label.sm">{t("edit-history-current")}</Text>
        )}
        <HStack gap={2} flexWrap="wrap">
          <Button
            minH="44px"
            minW="44px"
            size="sm"
            variant="outline"
            aria-label={t("edit-previous-change")}
            data-testid="concept-note-history-previous"
            disabled={index === 0}
            onClick={() => navigate(index - 1)}
          >
            <Icon as={LuChevronLeft} />
          </Button>
          <Text fontSize="label.sm" aria-live="polite">
            {t("edit-header-position", {
              current: changes.length ? index + 1 : 0,
              total: changes.length,
            })}
          </Text>
          <Button
            minH="44px"
            minW="44px"
            size="sm"
            variant="outline"
            aria-label={t("edit-next-change")}
            data-testid="concept-note-history-next"
            disabled={index >= changes.length - 1}
            onClick={() => navigate(index + 1)}
          >
            <Icon as={LuChevronRight} />
          </Button>
          <Button
            size="sm"
            minH="44px"
            disabled={Boolean(edits.busy) || stale || !changes.length}
            loading={Boolean(edits.busy)}
            data-testid="concept-note-history-confirm"
            onClick={async () => {
              if (
                await edits.restore(
                  review.entry,
                  review.operation,
                  review.expected,
                )
              )
                onCancel();
            }}
          >
            {t(
              review.operation === "undo"
                ? "edit-history-confirm-undo"
                : "edit-history-confirm-restore",
            )}
          </Button>
          <Button
            size="sm"
            minH="44px"
            variant="outline"
            disabled={Boolean(edits.busy)}
            data-testid="concept-note-history-cancel"
            onClick={onCancel}
          >
            {t("cancel")}
          </Button>
        </HStack>
      </HStack>
    </Box>
  );
}
