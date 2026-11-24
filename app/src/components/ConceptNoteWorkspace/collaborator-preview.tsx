"use client";

import { Badge, Box, Heading, Text, VStack } from "@chakra-ui/react";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type { EditChange, EditProposal } from "@/util/concept-note-edit-types";
import { remarkMissingInformation } from "./draft-markdown";
import { EditDiff } from "./edit-diff";
import { missingInformationComponents } from "./missing-information";
import {
  WorkspaceLoadingState,
  WorkspaceUnavailableState,
} from "./workspace-states";

const markdownComponents = missingInformationComponents({});

/** Applied, still waiting for the author, or not applied. */
function changeState(proposal: EditProposal, change: EditChange) {
  if (proposal.result?.accepted_change_ids.includes(change.change_id))
    return "applied";
  return proposal.status === "proposed" ? "pending" : "not-applied";
}

/**
 * Read-only view of another author's note for a collaborator with access to its
 * city: chapters, saved gap answers and proposals. It has no write controls; the
 * API refuses every write from anyone but the author.
 */
export function ConceptNoteCollaboratorPreview({
  cityId,
  lng,
  runId,
}: {
  cityId: string;
  lng: string;
  runId: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const { data, error, isLoading, refetch } = api.useGetConceptNotePreviewQuery(
    { cityId, runId },
  );

  if (isLoading) return <WorkspaceLoadingState />;
  if (!data) {
    const status = (error as FetchBaseQueryError | undefined)?.status;
    return (
      <WorkspaceUnavailableState
        cityId={cityId}
        lng={lng}
        transientLoadFailure={status !== 403 && status !== 404}
        onRetry={() => void refetch()}
      />
    );
  }

  const proposals = data.proposals.filter(
    (proposal) => proposal.changes.length > 0,
  );
  return (
    <Box
      bg="background.alternativeLight"
      px={{ base: 4, md: 10 }}
      py={8}
      data-testid="concept-note-collaborator-preview"
    >
      <VStack align="stretch" gap={6} maxW="960px" mx="auto">
        <VStack align="start" gap={2}>
          <Heading as="h1" fontFamily="heading" fontSize="title.md">
            {data.name}
          </Heading>
          <Text fontSize="body.sm" color="content.secondary">
            {t("preview-read-only")}
          </Text>
        </VStack>

        {data.draft.chapters.map((chapter) => {
          const saved = chapter.gaps.filter((gap) => gap.answered_so_far);
          return (
            <Box
              as="section"
              key={chapter.chapter_id}
              bg="base.light"
              borderRadius="rounded"
              p={6}
            >
              <Heading as="h2" fontSize="title.sm" mb={3}>
                {chapter.title}
              </Heading>
              {chapter.body_markdown ? (
                <Box fontSize="body.md" css={{ "& p": { mb: 3 } }}>
                  <ReactMarkdown
                    components={markdownComponents}
                    remarkPlugins={[remarkGfm, remarkMissingInformation]}
                  >
                    {chapter.body_markdown}
                  </ReactMarkdown>
                </Box>
              ) : (
                <Text fontSize="body.sm" color="content.tertiary">
                  {t("chapter-awaiting-copy")}
                </Text>
              )}
              {saved.map((gap) => (
                <Box
                  key={gap.gap_id}
                  mt={3}
                  p={3}
                  borderRadius="sm"
                  bg="background.neutral"
                  data-testid="concept-note-preview-saved-answers"
                >
                  <Text fontSize="body.sm" fontWeight="semibold">
                    {gap.question}
                  </Text>
                  <Text fontSize="body.sm" color="content.tertiary">
                    {t("preview-saved-answers")}
                  </Text>
                  <Text fontSize="body.sm" whiteSpace="pre-wrap">
                    {gap.answered_so_far}
                  </Text>
                </Box>
              ))}
            </Box>
          );
        })}

        <VStack as="section" align="stretch" gap={3}>
          <Heading as="h2" fontSize="title.sm">
            {t("preview-proposals-heading")}
          </Heading>
          {proposals.length === 0 && (
            <Text fontSize="body.sm" color="content.tertiary">
              {t("preview-no-proposals")}
            </Text>
          )}
          {proposals.map((proposal) => (
            <Box
              key={proposal.proposal_id}
              bg="base.light"
              borderRadius="rounded"
              p={4}
            >
              <Text fontSize="body.sm" mb={2}>
                {proposal.instruction}
              </Text>
              <VStack align="stretch" gap={3}>
                {proposal.changes.map((change) => {
                  const state = changeState(proposal, change);
                  return (
                    <Box key={change.change_id}>
                      <Badge
                        mb={1}
                        colorPalette={
                          state === "applied"
                            ? "green"
                            : state === "pending"
                              ? "blue"
                              : "gray"
                        }
                        data-testid="concept-note-preview-change-state"
                      >
                        {t(`preview-change-${state}`)}
                      </Badge>
                      <EditDiff change={change} lng={lng} />
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          ))}
        </VStack>
      </VStack>
    </Box>
  );
}
