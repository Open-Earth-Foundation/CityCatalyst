"use client";

import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import { useParams } from "next/navigation";

import { useTranslation } from "@/i18n/client";
import {
  MultiSourceProposalCard,
  ResolvedDecisionSummaryCard,
  SingleSourceProposalCard,
} from "@/components/StationaryEnergyDraft/stationary-energy-review-cards";
import type {
  StationaryEnergyChatArtifactControllerActions,
  StationaryEnergyChatArtifactControllerState,
} from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";
import { getParamValueRequired } from "@/util/helpers";

type SourceDetailPaneProps = {
  actions: Pick<
    StationaryEnergyChatArtifactControllerActions,
    "chooseDecision" | "editDecision" | "setChatInput"
  >;
  state: Pick<
    StationaryEnergyChatArtifactControllerState,
    | "decisionReviewContext"
    | "decisionState"
    | "focusedProposalId"
    | "resolvedProposalIds"
  >;
};

export function SourceDetailPane({ actions, state }: SourceDetailPaneProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");

  const context = state.decisionReviewContext.find(
    (candidate) => candidate.proposal_id === state.focusedProposalId,
  );

  const handleAskAboutProposal = (label: string) => {
    actions.setChatInput(t("chat-panel-ask-about-proposal", { label }));
  };

  const resolved = context
    ? state.resolvedProposalIds.has(context.proposal_id)
    : false;

  // Running list of decisions the user has already staged (excluding the one
  // currently in focus), so choices stay visible as they move through rows.
  const stagedContexts = state.decisionReviewContext.filter(
    (candidate) =>
      state.resolvedProposalIds.has(candidate.proposal_id) &&
      candidate.proposal_id !== state.focusedProposalId,
  );

  return (
    <Box
      bg="base.light"
      borderColor="border.neutral"
      borderWidth="1px"
      borderRadius="rounded-xl"
      overflow="hidden"
      h={{ base: "auto", xl: "full" }}
      minH={0}
      display="flex"
      flexDir="column"
    >
      <Flex
        align="center"
        gap={3}
        p={4}
        borderBottomWidth="1px"
        borderColor="border.neutral"
        bg="base.light"
      >
        <Text fontFamily="heading" fontWeight="semibold" color="content.primary">
          Source review
        </Text>
      </Flex>

      <VStack
        align="stretch"
        gap={3}
        flex="1"
        minH={0}
        overflowY="auto"
        p={4}
        bg="background.backgroundGreyFlat"
        data-testid="source-detail-pane"
      >
        {context ? (
          resolved ? (
            <ResolvedDecisionSummaryCard
              context={context}
              decision={state.decisionState[context.proposal_id]}
              onEditDecision={actions.editDecision}
            />
          ) : context.kind === "single_source" ? (
            <SingleSourceProposalCard
              context={context}
              decision={state.decisionState[context.proposal_id]}
              resolved={false}
              onDecisionChoice={actions.chooseDecision}
              onAskAboutProposal={handleAskAboutProposal}
            />
          ) : (
            <MultiSourceProposalCard
              context={context}
              decision={state.decisionState[context.proposal_id]}
              resolved={false}
              onDecisionChoice={actions.chooseDecision}
              onAskAboutProposal={handleAskAboutProposal}
            />
          )
        ) : (
          <Box
            color="content.tertiary"
            fontSize="body.md"
            textAlign="center"
            py={12}
            px={4}
          >
            Select a row on the left to review its data sources and emissions.
          </Box>
        )}

        {stagedContexts.length > 0 ? (
          <Box pt={2}>
            <Text
              color="content.tertiary"
              fontSize="label.sm"
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="wide"
              mb={2}
            >
              Staged decisions ({stagedContexts.length})
            </Text>
            <VStack align="stretch" gap={2}>
              {stagedContexts.map((staged) => (
                <ResolvedDecisionSummaryCard
                  key={staged.proposal_id}
                  context={staged}
                  decision={state.decisionState[staged.proposal_id]}
                  onEditDecision={actions.editDecision}
                />
              ))}
            </VStack>
          </Box>
        ) : null}
      </VStack>
    </Box>
  );
}
