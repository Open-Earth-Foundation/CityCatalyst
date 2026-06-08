"use client";

import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useTranslation } from "@/i18n/client";
import ByScopeViewSourceDrawer from "@/app/[lng]/[inventory]/InventoryResultTab/ByScopeViewSourceDrawer";
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
    "chooseDecision" | "editDecision" | "sendChatMessage"
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
  const inventoryId = getParamValueRequired(params.inventory);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  // The reused inventories SourceDrawer reads its labels from the "data"
  // namespace, so it needs a t bound to that namespace (not the SE one).
  const { t: tDrawer } = useTranslation(lng, "data");
  const [viewSourceId, setViewSourceId] = useState<string | null>(null);

  const context = state.decisionReviewContext.find(
    (candidate) => candidate.proposal_id === state.focusedProposalId,
  );

  const handleAskAboutProposal = (label: string) => {
    actions.sendChatMessage(t("chat-panel-ask-about-proposal", { label }));
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
      overflow={{ base: "visible", xl: "hidden" }}
      h={{ base: "auto", xl: "full" }}
      minH={0}
      display="flex"
      flexDir="column"
    >
      <Flex
        align="center"
        gap="s"
        px="m"
        py="m"
        borderBottomWidth="1px"
        borderColor="border.neutral"
        bg="base.light"
      >
        <Text fontFamily="heading" fontWeight="semibold" color="content.primary">
          {t("source-detail-title")}
        </Text>
      </Flex>

      <VStack
        align="stretch"
        gap="m"
        flex={{ base: "initial", xl: 1 }}
        minH={0}
        overflowY={{ base: "visible", xl: "auto" }}
        p="m"
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
              onViewSource={setViewSourceId}
            />
          ) : (
            <MultiSourceProposalCard
              context={context}
              decision={state.decisionState[context.proposal_id]}
              resolved={false}
              onDecisionChoice={actions.chooseDecision}
              onAskAboutProposal={handleAskAboutProposal}
              onViewSource={setViewSourceId}
            />
          )
        ) : (
          <Box
            color="content.tertiary"
            fontSize="body.md"
            textAlign="center"
            py="xxl"
            px="m"
          >
            {t("source-detail-empty")}
          </Box>
        )}

        {stagedContexts.length > 0 ? (
          <Box pt="s">
            <Text
              color="content.tertiary"
              fontSize="label.sm"
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="wide"
              mb="s"
            >
              {t("source-detail-staged-heading", {
                count: stagedContexts.length,
              })}
            </Text>
            <VStack align="stretch" gap="s">
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

      <ByScopeViewSourceDrawer
        sourceId={viewSourceId ?? ""}
        sector={{ sectorName: "stationary-energy" }}
        isOpen={viewSourceId !== null}
        onClose={() => setViewSourceId(null)}
        t={tDrawer}
        inventoryId={inventoryId}
      />
    </Box>
  );
}
