"use client";

import { useState } from "react";
import {
  Box,
  chakra,
  HStack,
  Icon,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { LuChevronLeft, LuChevronRight, LuEllipsis } from "react-icons/lu";

import { ReviewButton as Button } from "./review-button";
import {
  PopoverBody,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/i18n/client";
import type { EditProposal } from "@/util/concept-note-edit-types";

interface ProposalCardProps {
  proposal: EditProposal;
  lng: string;
  busy: boolean;
  onApply: (proposal: EditProposal, selectedIds?: string[]) => Promise<void>;
  onReject: (proposal: EditProposal) => Promise<void>;
  onNavigate: (chapterId: string, changeId?: string) => void;
  canApply?: boolean;
  activeChangeId?: string;
  onRefine?: (proposal: EditProposal, instruction: string) => Promise<void>;
  onOpenSources?: () => void;
}

export function EditProposalCard({
  proposal,
  lng,
  busy,
  onApply,
  onReject,
  onNavigate,
  onRefine,
  onOpenSources,
  canApply = true,
  activeChangeId,
}: ProposalCardProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [index, setIndex] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [refining, setRefining] = useState(false);
  const [instruction, setInstruction] = useState(proposal.instruction);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const selected =
    selection ?? new Set(proposal.changes.map((change) => change.change_id));
  const activeIndex = activeChangeId
    ? Math.max(
        0,
        proposal.changes.findIndex(
          (change) => change.change_id === activeChangeId,
        ),
      )
    : Math.min(index, Math.max(0, proposal.changes.length - 1));
  const change = proposal.changes[activeIndex];
  const awaitingReview = proposal.status === "proposed";
  const groups = [...new Set(proposal.changes.map((item) => item.group_id))];
  const canRefine =
    Boolean(onRefine) &&
    ["proposed", "clarification_required", "failed", "stale"].includes(
      proposal.status,
    );

  function navigate(next: number): void {
    setIndex(next);
    onNavigate(
      proposal.changes[next].chapter_id,
      proposal.changes[next].change_id,
    );
  }

  return (
    <VStack
      align="stretch"
      gap={2}
      flexDirection="row"
      flexWrap="wrap"
      bg="base.light"
      maxW="full"
      minW={0}
      position="relative"
      data-testid="concept-note-document-review"
      data-proposal-id={proposal.proposal_id}
    >
      {awaitingReview && proposal.changes.length > 0 && (
        <Box
          flexBasis="100%"
          maxW="400px"
          minW={0}
          data-testid="concept-note-review-summary"
        >
          <Text fontSize="label.sm" color="content.secondary">
            {t("edit-review-scope", {
              count: proposal.changes.length,
              chapters: new Set(proposal.changes.map((item) => item.chapter_id))
                .size,
            })}
          </Text>
          {proposal.changes.some(
            (item) =>
              item.kind === "factual" &&
              item.user_input_quote &&
              !item.source_refs.length,
          ) && (
            <Text
              fontSize="label.sm"
              color="content.secondary"
              data-testid="concept-note-user-facts-notice"
            >
              {t("edit-user-facts-notice")}
            </Text>
          )}
        </Box>
      )}
      {proposal.clarification && (
        <Text fontSize="body.sm" color="content.primary">
          {proposal.clarification}
        </Text>
      )}
      {proposal.error_code && proposal.status !== "clarification_required" && (
        <Text role="alert" fontSize="label.sm" color="content.primary">
          {t(
            proposal.status === "stale" ? "edit-stale-hint" : "edit-retry-hint",
          )}
        </Text>
      )}
      {!canApply && <Text role="alert">{t("edit-inline-stale")}</Text>}
      {change && (
        <>
          <HStack
            gap={1}
            aria-label={t("edit-change-position", {
              current: activeIndex + 1,
              total: proposal.changes.length,
            })}
          >
            <Button
              minW="44px"
              minH="44px"
              size="sm"
              variant="outline"
              p={0}
              color="content.primary"
              aria-label={t("edit-previous-change")}
              data-testid="concept-note-edit-previous"
              disabled={activeIndex === 0}
              onClick={() => navigate(activeIndex - 1)}
            >
              <Icon as={LuChevronLeft} />
            </Button>
            <Text
              fontSize="label.sm"
              minW="54px"
              textAlign="center"
              aria-live="polite"
            >
              {t("edit-header-position", {
                current: activeIndex + 1,
                total: proposal.changes.length,
              })}
            </Text>
            <Button
              minW="44px"
              minH="44px"
              size="sm"
              variant="outline"
              p={0}
              color="content.primary"
              aria-label={t("edit-next-change")}
              data-testid="concept-note-edit-next"
              disabled={activeIndex === proposal.changes.length - 1}
              onClick={() => navigate(activeIndex + 1)}
            >
              <Icon as={LuChevronRight} />
            </Button>
          </HStack>
          {awaitingReview && (
            <HStack
              gap={2}
              flexWrap="wrap"
              data-testid="concept-note-edit-primary-actions"
            >
              <Button
                minH="44px"
                size="sm"
                variant="ghost"
                data-testid="concept-note-edit-reject-all"
                disabled={busy}
                onClick={() => void onReject(proposal)}
              >
                {t("edit-reject-all")}
              </Button>
              <Button
                minH="44px"
                size="sm"
                data-testid="concept-note-edit-apply-all"
                disabled={busy || !canApply}
                loading={busy}
                onClick={() => void onApply(proposal)}
              >
                {t("edit-accept-all")}
              </Button>
            </HStack>
          )}
        </>
      )}
      <PopoverRoot
        lazyMount
        unmountOnExit
        positioning={{ placement: "bottom-end" }}
      >
        <PopoverTrigger asChild>
          <Button
            size="xs"
            minH="44px"
            minW="32px"
            p={0}
            variant="ghost"
            aria-label={t("edit-review-options")}
            data-testid="concept-note-edit-options"
          >
            <Icon as={LuEllipsis} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          width="340px"
          maxW="calc(100vw - 32px)"
          maxH="min(480px, 70vh)"
          overflowY="auto"
        >
          <PopoverBody>
            <VStack align="stretch" gap={2}>
              {change && (
                <Box data-testid="concept-note-review-details">
                  <Text fontSize="body.md" fontWeight="semibold">
                    {change.chapter_title}
                  </Text>
                  <Text fontSize="label.sm" color="content.secondary">
                    {t("edit-inline-legend")}
                  </Text>
                  {groups.length > 1 && (
                    <Text
                      fontSize="label.sm"
                      data-testid="concept-note-edit-current-group"
                    >
                      {t("edit-current-group", {
                        group: groups.indexOf(change.group_id) + 1,
                      })}
                    </Text>
                  )}
                  <Text fontSize="label.sm" color="content.secondary">
                    {t(
                      change.kind === "wording"
                        ? "edit-kind-wording"
                        : "edit-kind-factual",
                    )}
                  </Text>
                  {change.user_input_quote && (
                    <Text fontSize="label.sm" color="content.secondary">
                      {t("edit-user-input", {
                        quote: change.user_input_quote,
                        interpolation: { escapeValue: false },
                      })}
                    </Text>
                  )}
                  {change.source_refs.length > 0 && (
                    <Text fontSize="label.sm" color="content.secondary">
                      {t("edit-sources", {
                        sources:
                          change.source_snapshots
                            ?.map((source) => source.source_label)
                            .join(", ") || change.source_refs.join(", "),
                      })}
                    </Text>
                  )}
                  {change.source_refs.length > 0 && onOpenSources && (
                    <Button
                      size="xs"
                      minH="36px"
                      variant="ghost"
                      color="content.link"
                      data-testid="concept-note-edit-view-sources"
                      onClick={onOpenSources}
                    >
                      {t("edit-view-sources")}
                    </Button>
                  )}
                </Box>
              )}
              {awaitingReview && proposal.changes.length > 1 && (
                <>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    color="content.link"
                    minH="36px"
                    aria-expanded={selecting}
                    data-testid="concept-note-edit-select-toggle"
                    onClick={() => setSelecting(!selecting)}
                  >
                    {t("edit-select-changes")}
                  </Button>
                  {selecting && (
                    <Box
                      as="fieldset"
                      borderTop="1px solid"
                      borderColor="border.neutral"
                      pt={3}
                    >
                      <chakra.legend fontSize="label.sm">
                        {t("edit-group-selection-hint")}
                      </chakra.legend>
                      {groups.map((group, groupIndex) => {
                        const changes = proposal.changes.filter(
                          (item) => item.group_id === group,
                        );
                        return (
                          <chakra.label
                            key={group}
                            display="flex"
                            gap={2}
                            alignItems="center"
                            minH="44px"
                            fontSize="label.sm"
                          >
                            <input
                              type="checkbox"
                              data-testid="concept-note-edit-group"
                              data-group-id={group}
                              disabled={busy}
                              checked={changes.every((item) =>
                                selected.has(item.change_id),
                              )}
                              onChange={(event) =>
                                setSelection((current) => {
                                  const next = new Set(
                                    current ??
                                      proposal.changes.map(
                                        (item) => item.change_id,
                                      ),
                                  );
                                  for (const item of changes) {
                                    if (event.target.checked)
                                      next.add(item.change_id);
                                    else next.delete(item.change_id);
                                  }
                                  return next;
                                })
                              }
                            />
                            {t("edit-group-label", {
                              group: groupIndex + 1,
                              count: changes.length,
                              chapters: [
                                ...new Set(
                                  changes.map((item) => item.chapter_title),
                                ),
                              ].join(", "),
                            })}
                          </chakra.label>
                        );
                      })}
                      <Button
                        size="sm"
                        minH="44px"
                        variant="outline"
                        disabled={busy || !canApply || selected.size === 0}
                        data-testid="concept-note-edit-apply-selected"
                        onClick={() => void onApply(proposal, [...selected])}
                      >
                        {t("edit-apply-selected", { count: selected.size })}
                      </Button>
                    </Box>
                  )}
                </>
              )}
              {canRefine && (
                <>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    color="content.link"
                    minH="36px"
                    disabled={busy}
                    aria-expanded={refining}
                    data-testid="concept-note-edit-refine-toggle"
                    onClick={() => setRefining(!refining)}
                  >
                    {t("edit-refine-request")}
                  </Button>
                  {refining && (
                    <Box
                      as="form"
                      data-testid="concept-note-edit-refine-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (instruction.trim())
                          void onRefine?.(proposal, instruction);
                      }}
                    >
                      <chakra.label
                        htmlFor={`refine-document-${proposal.proposal_id}`}
                        fontSize="label.sm"
                      >
                        {t("edit-refine-label")}
                      </chakra.label>
                      <Textarea
                        id={`refine-document-${proposal.proposal_id}`}
                        value={instruction}
                        maxLength={8_000}
                        disabled={busy}
                        data-testid="concept-note-edit-refine-input"
                        onChange={(event) => setInstruction(event.target.value)}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        minH="44px"
                        mt={2}
                        disabled={busy || !instruction.trim()}
                        data-testid="concept-note-edit-refine-submit"
                      >
                        {t("edit-refine-submit")}
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </PopoverRoot>
      {proposal.status === "processing" && (
        <Button
          minH="44px"
          size="sm"
          variant="outline"
          data-testid="concept-note-edit-cancel"
          disabled={busy}
          onClick={() => void onReject(proposal)}
        >
          {t("cancel")}
        </Button>
      )}
      {["failed", "stale", "clarification_required"].includes(
        proposal.status,
      ) && (
        <Button
          minH="36px"
          size="xs"
          variant="outline"
          data-testid="concept-note-edit-dismiss"
          disabled={busy}
          onClick={() => void onReject(proposal)}
        >
          {t("edit-dismiss")}
        </Button>
      )}
    </VStack>
  );
}
