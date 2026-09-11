"use client";

import { HStack, Text } from "@chakra-ui/react";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import type { EditChange, EditProposal } from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";
import { EditProposalCard } from "./edit-proposal-card";
import { proposalMatchesDraft } from "./inline-review";
import type { useConceptNoteEdits } from "./use-concept-note-edits";

export type EditController = ReturnType<typeof useConceptNoteEdits>;

/** Keep the latest actionable response visible, including questions and recoverable failures. */
export function selectReviewProposal(
  proposals: EditProposal[],
): EditProposal | undefined {
  return proposals.find((proposal) =>
    [
      "processing",
      "proposed",
      "clarification_required",
      "failed",
      "stale",
    ].includes(proposal.status),
  );
}

export function documentReviewChanges(
  proposal: EditProposal | undefined,
  chapters: ConceptNoteDraftChapter[],
): EditChange[] {
  if (
    !proposal ||
    proposal.status !== "proposed" ||
    !proposalMatchesDraft(proposal, chapters)
  )
    return [];
  const positions = new Map(
    chapters.map((chapter) => [chapter.chapter_id, chapter.position]),
  );
  return [...proposal.changes].sort(
    (a, b) =>
      (positions.get(a.chapter_id) ?? 0) - (positions.get(b.chapter_id) ?? 0) ||
      a.start - b.start,
  );
}

interface Props {
  proposal: EditProposal;
  chapters: ConceptNoteDraftChapter[];
  edits: EditController;
  changes: EditChange[];
  activeChangeId?: string;
  lng: string;
  onNavigate: (chapterId: string, changeId?: string) => void;
  onOpenSources: () => void;
  isDocumentVisible?: boolean;
  hasDecisions?: boolean;
  onAcceptRemaining?: (proposal: EditProposal) => Promise<void>;
  onRejectRemaining?: (proposal: EditProposal) => Promise<void>;
}

export function DocumentReviewToolbar({
  proposal,
  chapters,
  edits,
  changes,
  activeChangeId,
  lng,
  onNavigate,
  onOpenSources,
  isDocumentVisible = true,
  hasDecisions = false,
  onAcceptRemaining,
  onRejectRemaining,
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
  return (
    <EditProposalCard
      key={proposal.proposal_id}
      proposal={{
        ...proposal,
        changes: changes.length ? changes : proposal.changes,
      }}
      lng={lng}
      busy={Boolean(edits.busy) || edits.reloadingDraft}
      hasDecisions={hasDecisions}
      onApply={onAcceptRemaining ?? edits.apply}
      onReject={
        proposal.status === "proposed" && onRejectRemaining
          ? onRejectRemaining
          : edits.reject
      }
      onNavigate={onNavigate}
      activeChangeId={activeChangeId}
      canApply={
        !edits.needsDraftReload &&
        (proposal.status !== "proposed" ||
          proposalMatchesDraft(proposal, chapters))
      }
      onOpenSources={onOpenSources}
      onRefine={edits.refine}
    />
  );
}

/** Recovery stays visible even after an applied proposal leaves the toolbar. */
export function DocumentReviewFeedback({
  edits,
  lng,
}: {
  edits: EditController;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!edits.error && !edits.needsDraftReload) return null;
  return (
    <HStack
      align="start"
      flexWrap="wrap"
      data-testid="concept-note-document-edit-error"
    >
      <Text role="alert" fontSize="label.sm" color="content.primary">
        {t(
          edits.needsDraftReload
            ? "edit-draft-reload-hint"
            : edits.error === "stale_base"
              ? "edit-stale-hint"
              : "edit-request-error",
        )}
      </Text>
      <Button
        size="xs"
        minH="36px"
        variant="outline"
        loading={edits.reloadingDraft}
        disabled={Boolean(edits.busy) || edits.reloadingDraft}
        onClick={() =>
          void (edits.needsDraftReload ? edits.reloadDraft() : edits.refresh())
        }
      >
        {t(edits.needsDraftReload ? "edit-reload-draft" : "edit-refresh")}
      </Button>
    </HStack>
  );
}
