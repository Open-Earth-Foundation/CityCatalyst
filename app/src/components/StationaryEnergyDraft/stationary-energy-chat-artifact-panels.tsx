"use client";
/* eslint-disable i18next/no-literal-string */

import { Box, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdSend } from "react-icons/md";

import {
  FLOW_BUTTON_RADIUS,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
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
  LoadingAction,
} from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";
import { Button } from "@/components/ui/button";

type ClimaChatPanelProps = {
  stage: DraftStage;
  draftState: DraftStatusResponse | null;
  counts: DraftCounts;
  pendingDecisionCount: number;
  decisionReviewContext: DecisionReviewContext[];
  decisionState: Record<string, DraftDecisionState>;
  resolvedProposalIds: Set<string>;
  sourcePreference: string | null;
  sourcePreferenceOptions: string[];
  chatMessages: ChatMessage[];
  chatInput: string;
  loadingAction: LoadingAction;
  canPersistDraftReview: boolean;
  canSaveToInventory: boolean;
  hasSourceBackedProposals: boolean;
  errorMessage: string | null;
  showStaleWarning: boolean;
  staleDraft: DraftStatusResponse["staleness"];
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStopChat: () => void;
  onStartDraft: () => void;
  onPreference: (preference: string) => void;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onEditDecision: (proposalId: string) => void;
  onContinueStaleDraft: () => void;
  onStartOver: () => void;
  onSaveDraft: () => void;
  onSaveToInventory: () => void;
};

export function ClimaChatPanel(props: ClimaChatPanelProps) {
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const pendingDecisionAnchorRef = useRef<HTMLDivElement | null>(null);
  const [showPendingDecisionNudge, setShowPendingDecisionNudge] =
    useState(false);
  const firstPendingDecision =
    props.decisionReviewContext.find(
      (context) => !props.resolvedProposalIds.has(context.proposal_id),
    ) ?? null;
  const { chatInput, onChatInputChange } = props;

  const focusChatComposer = useCallback(
    (draftQuestion?: string) => {
      if (draftQuestion && !chatInput.trim()) {
        onChatInputChange(draftQuestion);
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
    [chatInput, onChatInputChange],
  );

  const handleAskAboutProposal = useCallback(
    (label: string) => {
      focusChatComposer(
        `Can you explain the connected source proposal for ${label}?`,
      );
    },
    [focusChatComposer],
  );

  const handleJumpToPendingDecision = useCallback(() => {
    pendingDecisionAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, []);

  useEffect(() => {
    if (props.showStaleWarning || !firstPendingDecision) {
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
  }, [firstPendingDecision, props.chatMessages.length, props.showStaleWarning]);

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
            Clima
          </Text>
          <Text fontSize="label.md" opacity={0.9}>
            Climate Advisor
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
            pendingDecisionCount={props.pendingDecisionCount}
            onAskQuestion={() =>
              handleAskAboutProposal(firstPendingDecision.label)
            }
            onJumpToReview={handleJumpToPendingDecision}
          />
        ) : null}
        {props.showStaleWarning ? (
          <StaleDraftPanel
            staleDraft={props.staleDraft ?? null}
            onContinue={props.onContinueStaleDraft}
            onStartOver={props.onStartOver}
          />
        ) : (
          <>
            <StageMessages {...props} />
            {props.errorMessage ? (
              <Box
                color="sentiment.negativeDefault"
                bg="sentiment.negativeOverlay"
                borderRadius="rounded"
                px={3}
                py={2}
                fontSize="label.md"
              >
                {props.errorMessage}
              </Box>
            ) : null}
            {props.chatMessages.map((message) => {
              if (message.kind === "decision_review") {
                const context = props.decisionReviewContext.find(
                  (candidate) => candidate.proposal_id === message.proposalId,
                );
                if (!context) {
                  return null;
                }

                const content = props.resolvedProposalIds.has(
                  context.proposal_id,
                ) ? (
                  <ResolvedDecisionSummaryCard
                    context={context}
                    decision={props.decisionState[context.proposal_id]}
                    onEditDecision={props.onEditDecision}
                  />
                ) : context.kind === "single_source" ? (
                  <SingleSourceProposalCard
                    context={context}
                    decision={props.decisionState[context.proposal_id]}
                    resolved={false}
                    onDecisionChoice={props.onDecisionChoice}
                    onAskAboutProposal={handleAskAboutProposal}
                  />
                ) : (
                  <MultiSourceProposalCard
                    context={context}
                    decision={props.decisionState[context.proposal_id]}
                    resolved={false}
                    onDecisionChoice={props.onDecisionChoice}
                    onAskAboutProposal={handleAskAboutProposal}
                  />
                );

                return (
                  <Box
                    key={message.id}
                    ref={
                      context.proposal_id === firstPendingDecision?.proposal_id
                        ? pendingDecisionAnchorRef
                        : undefined
                    }
                    scrollMarginTop="72px"
                  >
                    {content}
                  </Box>
                );
              }

              return message.role === "user" ? (
                <UserBubble key={message.id} text={message.text} />
              ) : (
                <AgentBubble
                  key={message.id}
                  text={message.text || "Thinking..."}
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
        <form onSubmit={props.onChatSubmit}>
          <HStack gap={2}>
            <Input
              ref={chatInputRef}
              value={props.chatInput}
              onChange={(event) => props.onChatInputChange(event.target.value)}
              placeholder={
                props.pendingDecisionCount > 0
                  ? "Ask about a source or row before deciding..."
                  : "Message Clima..."
              }
              borderRadius="rounded"
              bg="background.backgroundGreyFlat"
              borderColor="border.overlay"
              disabled={props.loadingAction === "chat"}
            />
            {props.loadingAction === "chat" ? (
              <Button
                variant="outline"
                borderRadius={FLOW_BUTTON_RADIUS}
                onClick={props.onStopChat}
              >
                Stop
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
