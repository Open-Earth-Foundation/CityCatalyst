"use client";

import ByScopeViewSourceDrawer from "@/components/GHGI/inventory-result/ByScopeViewSourceDrawer";
import type { DecisionReviewContext } from "@/components/StationaryEnergyDraft/flow";
import { StationaryEnergyChatComposer } from "@/components/StationaryEnergyDraft/stationary-energy-chat-composer";
import { StationaryEnergyChatMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-message";
import type { ClimaChatPanelProps } from "@/components/StationaryEnergyDraft/stationary-energy-chat-panel-types";
import {
  AgentBubble,
  RetryableErrorPanel,
  StaleDraftPanel,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-primitives";
import { StageMessages } from "@/components/StationaryEnergyDraft/stationary-energy-chat-stage-messages";
import { StationaryEnergySuggestedQuestions } from "@/components/StationaryEnergyDraft/stationary-energy-chat-suggestions";
import { useStationaryEnergyChatPanelInteractions } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-panel-interactions";
import { useTranslation } from "@/i18n/client";
import { getParamValueRequired } from "@/util/helpers";
import { Box, VStack } from "@chakra-ui/react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

export function ClimaChatPanel({ actions, state }: ClimaChatPanelProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const inventoryId = getParamValueRequired(params.inventory);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const { t: tDrawer } = useTranslation(lng, "data");
  const [viewSourceId, setViewSourceId] = useState<string | null>(null);
  const {
    scrollRegionRef,
    chatInputRef,
    handleChatScroll,
    handleAskAboutProposal,
    pinToBottom,
  } = useStationaryEnergyChatPanelInteractions({ actions, state, t });
  // Build the lookup once per context update instead of scanning it for every message.
  const contextByProposalId = useMemo(() => {
    const index = new Map<string, DecisionReviewContext>();
    for (const context of state.decisionReviewContext) {
      if (!index.has(context.proposal_id))
        index.set(context.proposal_id, context);
    }
    return index;
  }, [state.decisionReviewContext]);
  const focusedContext = useMemo(() => {
    const focused = state.focusedProposalId
      ? contextByProposalId.get(state.focusedProposalId)
      : undefined;
    return focused && !state.resolvedProposalIds.has(focused.proposal_id)
      ? focused
      : (state.decisionReviewContext.find(
          (context) => !state.resolvedProposalIds.has(context.proposal_id),
        ) ?? null);
  }, [
    contextByProposalId,
    state.focusedProposalId,
    state.resolvedProposalIds,
    state.decisionReviewContext,
  ]);
  const showSuggestedQuestions =
    !state.showStaleWarning && state.loadingAction !== "chat";
  return (
    <Box
      position="relative"
      overflow="hidden"
      h={{ base: "min(78dvh, 820px)", xl: "full" }}
      maxH={{ base: "78dvh", xl: "none" }}
      minH={0}
      display="flex"
      flexDir="column"
    >
      <VStack
        ref={scrollRegionRef}
        align="center"
        gap={4}
        flex="1"
        minH={0}
        overflowY="auto"
        px={{ base: 3, md: 6 }}
        py={{ base: 4, md: 6 }}
        bg="background.backgroundGreyFlat"
        data-testid="clima-chat-scroll-region"
        onScroll={handleChatScroll}
      >
        {state.showStaleWarning ? (
          <StaleDraftPanel
            staleDraft={state.staleDraft ?? null}
            onContinue={actions.continueStaleDraft}
            onStartOver={actions.startOver}
          />
        ) : (
          <>
            <StageMessages
              canPersistDraftReview={state.canPersistDraftReview}
              canSaveToInventory={state.canSaveToInventory}
              counts={state.counts}
              decisionReviewContext={state.decisionReviewContext}
              draftState={state.draftState}
              hasSourceBackedProposals={state.hasSourceBackedProposals}
              onPreference={actions.choosePreference}
              onSaveDraft={actions.saveDraft}
              onSaveToInventory={actions.requestSaveToInventoryConfirmation}
              onStartDraft={actions.startDraftFromChat}
              pendingDecisionCount={state.pendingDecisionCount}
              sourcePreference={state.sourcePreference}
              sourcePreferenceOptions={state.sourcePreferenceOptions}
              stage={state.stage}
            />
            {state.errorMessage ? (
              <RetryableErrorPanel
                message={state.errorMessage}
                onRetry={
                  state.errorRecoveryAction === "start_draft"
                    ? actions.startDraftFromChat
                    : undefined
                }
                retrying={state.loadingAction === "start"}
              />
            ) : null}
            {state.chatMessages.map((message) => (
              <StationaryEnergyChatMessage
                key={message.id}
                message={message}
                context={
                  message.kind === "decision_review"
                    ? contextByProposalId.get(message.proposalId)
                    : undefined
                }
                actions={actions}
                state={state}
                handleAskAboutProposal={handleAskAboutProposal}
                setViewSourceId={setViewSourceId}
              />
            ))}
            {/* Thinking or the running tool, so the chat never looks idle. */}
            {state.chatActivityLabel ? (
              <AgentBubble text={state.chatActivityLabel} />
            ) : null}
          </>
        )}
      </VStack>

      {showSuggestedQuestions ? (
        <StationaryEnergySuggestedQuestions
          t={t}
          stage={state.stage}
          focused={focusedContext}
          onAsk={actions.sendChatMessage}
        />
      ) : null}

      <StationaryEnergyChatComposer
        actions={actions}
        state={state}
        t={t}
        chatInputRef={chatInputRef}
        pinToBottom={pinToBottom}
      />

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
