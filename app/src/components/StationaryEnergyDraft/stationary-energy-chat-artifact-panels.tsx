"use client";

import { Box, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdSend } from "react-icons/md";

import { useTranslation } from "@/i18n/client";
import { FLOW_BUTTON_RADIUS } from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import { StageMessages } from "@/components/StationaryEnergyDraft/stationary-energy-chat-stage-messages";
import {
  AgentBubble,
  PendingDecisionNudge,
  StaleDraftPanel,
  UserBubble,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-primitives";
import {
  MultiSourceProposalCard,
  ResolvedDecisionSummaryCard,
  SingleSourceProposalCard,
} from "@/components/StationaryEnergyDraft/stationary-energy-review-cards";
import type { ChatMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import type {
  DecisionReviewContext,
  DraftCounts,
  DraftStage,
} from "@/components/StationaryEnergyDraft/flow";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftProposal,
  DraftStatusResponse,
} from "@/components/StationaryEnergyDraft/types";
import type {
  StationaryEnergyChatArtifactControllerActions,
  StationaryEnergyChatArtifactControllerState,
} from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";
import { Button } from "@/components/ui/button";
import { getParamValueRequired } from "@/util/helpers";
import { useParams } from "next/navigation";

type ClimaChatPanelProps = {
  actions: Pick<
    StationaryEnergyChatArtifactControllerActions,
    | "chooseDecision"
    | "choosePreference"
    | "continueStaleDraft"
    | "editDecision"
    | "saveDraft"
    | "saveToInventory"
    | "setChatInput"
    | "startDraftFromChat"
    | "startOver"
    | "stopChat"
    | "submitChat"
  >;
  state: Pick<
    StationaryEnergyChatArtifactControllerState,
    | "canPersistDraftReview"
    | "canSaveToInventory"
    | "chatInput"
    | "chatMessages"
    | "counts"
    | "decisionReviewContext"
    | "decisionState"
    | "draftState"
    | "errorMessage"
    | "hasSourceBackedProposals"
    | "loadingAction"
    | "pendingDecisionCount"
    | "resolvedProposalIds"
    | "showStaleWarning"
    | "sourcePreference"
    | "sourcePreferenceOptions"
    | "stage"
    | "staleDraft"
  >;
};

export function ClimaChatPanel({ actions, state }: ClimaChatPanelProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const pendingDecisionAnchorRef = useRef<HTMLDivElement | null>(null);
  const [showPendingDecisionNudge, setShowPendingDecisionNudge] =
    useState(false);
  const firstPendingDecision =
    state.decisionReviewContext.find(
      (context) => !state.resolvedProposalIds.has(context.proposal_id),
    ) ?? null;
  const { chatInput } = state;

  const focusChatComposer = useCallback(
    (draftQuestion?: string) => {
      if (draftQuestion && !chatInput.trim()) {
        actions.setChatInput(draftQuestion);
      }

      window.requestAnimationFrame(() => {
        const input = chatInputRef.current;
        if (!input) {
          return;
        }
        input.focus();
        const cursorPosition = input.value.length;
        input.setSelectionRange(cursorPosition, cursorPosition);
      });
    },
    [actions, chatInput],
  );

  const handleAskAboutProposal = useCallback(
    (label: string) => {
      focusChatComposer(t("chat-panel-ask-about-proposal", { label }));
    },
    [focusChatComposer, t],
  );

  const handleJumpToPendingDecision = useCallback(() => {
    pendingDecisionAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, []);

  useEffect(() => {
    if (state.showStaleWarning || !firstPendingDecision) {
      setShowPendingDecisionNudge(false);
      return;
    }

    const scrollRegion = scrollRegionRef.current;
    const pendingDecisionAnchor = pendingDecisionAnchorRef.current;
    if (!scrollRegion || !pendingDecisionAnchor) {
      setShowPendingDecisionNudge(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowPendingDecisionNudge(!entry.isIntersecting);
      },
      {
        root: scrollRegion,
        threshold: 0.45,
      },
    );

    observer.observe(pendingDecisionAnchor);
    return () => observer.disconnect();
  }, [firstPendingDecision, state.chatMessages.length, state.showStaleWarning]);

  return (
    <Box
      bg="base.light"
      borderColor="border.neutral"
      borderWidth="1px"
      borderRadius="rounded-xl"
      overflow="hidden"
      h={{ base: "min(72dvh, 760px)", xl: "full" }}
      maxH={{ base: "72dvh", xl: "none" }}
      minH={0}
      display="flex"
      flexDir="column"
    >
      <Flex
        align="center"
        gap={3}
        bg="interactive.tertiary"
        color="base.light"
        p={4}
      >
        <Box
          w="32px"
          h="32px"
          display="grid"
          placeItems="center"
          borderRadius="rounded"
          bg="interactive.primary"
          fontFamily="heading"
          fontWeight="semibold"
        >
          *
        </Box>
        <Box>
          <Text fontFamily="heading" fontWeight="semibold">
            {t("chat-panel-title")}
          </Text>
          <Text fontSize="label.md" opacity={0.9}>
            {t("chat-panel-subtitle")}
          </Text>
        </Box>
      </Flex>

      <VStack
        ref={scrollRegionRef}
        align="stretch"
        gap={3}
        flex="1"
        minH={0}
        overflowY="auto"
        p={4}
        bg="background.backgroundGreyFlat"
        data-testid="clima-chat-scroll-region"
      >
        {showPendingDecisionNudge && firstPendingDecision ? (
          <PendingDecisionNudge
            pendingDecisionCount={state.pendingDecisionCount}
            onAskQuestion={() =>
              handleAskAboutProposal(firstPendingDecision.label)
            }
            onJumpToReview={handleJumpToPendingDecision}
          />
        ) : null}
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
              onSaveToInventory={actions.saveToInventory}
              onStartDraft={actions.startDraftFromChat}
              pendingDecisionCount={state.pendingDecisionCount}
              sourcePreference={state.sourcePreference}
              sourcePreferenceOptions={state.sourcePreferenceOptions}
              stage={state.stage}
            />
            {state.errorMessage ? (
              <Box
                color="sentiment.negativeDefault"
                bg="sentiment.negativeOverlay"
                borderRadius="rounded"
                px={3}
                py={2}
                fontSize="label.md"
              >
                {state.errorMessage}
              </Box>
            ) : null}
            {state.chatMessages.map((message) => {
              if (message.kind === "decision_review") {
                // Decision/source-review cards now live in the right-side
                // "Source review" focus pane, so they no longer flood the chat.
                // The chat stays for conversation only.
                return null;
              }

              return message.role === "user" ? (
                <UserBubble key={message.id} text={message.text} />
              ) : (
                <AgentBubble
                  key={message.id}
                  text={message.text || t("chat-panel-thinking")}
                />
              );
            })}
          </>
        )}
      </VStack>

      <Box
        data-testid="clima-chat-composer"
        p={3}
        bg="base.light"
        borderTopWidth="1px"
        borderColor="border.neutral"
      >
        <form onSubmit={actions.submitChat}>
          <HStack gap={2}>
            <Input
              ref={chatInputRef}
              value={state.chatInput}
              onChange={(event) => actions.setChatInput(event.target.value)}
              placeholder={
                state.pendingDecisionCount > 0
                  ? t("chat-panel-placeholder-review")
                  : t("chat-panel-placeholder-default")
              }
              borderRadius="rounded"
              bg="background.backgroundGreyFlat"
              borderColor="border.overlay"
              disabled={state.loadingAction === "chat"}
            />
            {state.loadingAction === "chat" ? (
              <Button
                variant="outline"
                borderRadius={FLOW_BUTTON_RADIUS}
                onClick={actions.stopChat}
              >
                {t("chat-panel-stop")}
              </Button>
            ) : (
              <Button type="submit" borderRadius={FLOW_BUTTON_RADIUS} px={4}>
                <MdSend />
              </Button>
            )}
          </HStack>
        </form>
      </Box>
    </Box>
  );
}
