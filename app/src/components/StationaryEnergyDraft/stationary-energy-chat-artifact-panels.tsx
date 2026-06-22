"use client";

import {
  Box,
  Flex,
  HStack,
  Input,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdSend } from "react-icons/md";

import ByScopeViewSourceDrawer from "@/app/[lng]/[inventory]/InventoryResultTab/ByScopeViewSourceDrawer";
import { useTranslation } from "@/i18n/client";
import {
  CHAT_SURFACE_MAX_W,
  CHAT_WIDGET_TRANSFORM,
  FLOW_BUTTON_RADIUS,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import { StageMessages } from "@/components/StationaryEnergyDraft/stationary-energy-chat-stage-messages";
import {
  AgentBubble,
  BulkReviewConfirmationCard,
  InventorySaveConfirmationCard,
  StaleDraftPanel,
  StagedReviewUpdateConfirmationCard,
  StationaryEnergyToolSummaryCard,
  UserBubble,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-primitives";
import {
  ActionCompletedDecisionCard,
  MultiSourceProposalCard,
  SingleSourceProposalCard,
} from "@/components/StationaryEnergyDraft/stationary-energy-review-cards";
import type { ChatMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import type {
  DecisionReviewContext,
  DraftStage,
} from "@/components/StationaryEnergyDraft/flow";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import type {
  StationaryEnergyChatArtifactControllerActions,
  StationaryEnergyChatArtifactControllerState,
} from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";
import { Button } from "@/components/ui/button";
import { getParamValueRequired } from "@/util/helpers";

type ClimaChatPanelProps = {
  actions: Pick<
    StationaryEnergyChatArtifactControllerActions,
    | "chooseDecision"
    | "choosePreference"
    | "continueStaleDraft"
    | "confirmBulkReviewChanges"
    | "cancelBulkReviewChanges"
    | "confirmStagedReviewRollback"
    | "cancelStagedReviewUpdate"
    | "confirmSaveToInventory"
    | "requestSaveToInventoryConfirmation"
    | "cancelSaveToInventoryConfirmation"
    | "editDecision"
    | "saveDraft"
    | "saveToInventory"
    | "sendChatMessage"
    | "setFocusedProposal"
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
    | "focusedProposalId"
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

type SuggestedQuestion = { id: string; label: string; message: string };

function buildSuggestedQuestions(
  t: TFunction,
  stage: DraftStage,
  focused: DecisionReviewContext | null,
): SuggestedQuestion[] {
  const plain = (key: string): SuggestedQuestion => ({
    id: key,
    label: t(key),
    message: t(key),
  });

  if (stage === "start") {
    return [
      plain("chat-suggestion-start-sources"),
      plain("chat-suggestion-start-missing"),
      plain("chat-suggestion-start-method"),
    ];
  }

  if (stage === "drafting") {
    return [
      plain("chat-suggestion-drafting-progress"),
      plain("chat-suggestion-drafting-sources"),
    ];
  }

  if (stage === "decision") {
    if (focused) {
      const label = focused.label;
      const questions: SuggestedQuestion[] = [
        {
          id: "focused-why",
          label: t("chat-suggestion-decision-focused-why-short"),
          message: t("chat-suggestion-decision-focused-why", { label }),
        },
      ];
      if (focused.kind === "multi_source") {
        questions.push({
          id: "focused-diff",
          label: t("chat-suggestion-decision-focused-diff-short"),
          message: t("chat-suggestion-decision-focused-diff", { label }),
        });
      }
      questions.push({
        id: "focused-empty",
        label: t("chat-suggestion-decision-focused-empty-short"),
        message: t("chat-suggestion-decision-focused-empty", { label }),
      });
      return questions;
    }
    return [
      plain("chat-suggestion-decision-remaining"),
      plain("chat-suggestion-decision-gaps"),
      plain("chat-suggestion-decision-notation"),
    ];
  }

  return [
    plain("chat-suggestion-review-check"),
    plain("chat-suggestion-review-gaps"),
    plain("chat-suggestion-review-notation"),
  ];
}

function SuggestedQuestions(props: {
  questions: SuggestedQuestion[];
  onAsk: (message: string) => void;
}) {
  if (props.questions.length === 0) {
    return null;
  }
  return (
    <Box
      position="absolute"
      left={0}
      right={0}
      bottom="52px"
      zIndex={2}
      px={{ base: 3, md: 6 }}
      py={2}
      pointerEvents="none"
    >
      <Box w="full" maxW="900px" mx="auto" pointerEvents="auto">
        <Flex gap={2} flexWrap="wrap">
          {props.questions.map((question) => (
            <chakra.button
              type="button"
              key={question.id}
              onClick={() => props.onAsk(question.message)}
              textAlign="left"
              maxW="100%"
              px={3}
              py="6px"
              borderWidth="1px"
              borderColor="border.overlay"
              borderRadius="rounded"
              bg="background.transparentGrey"
              color="content.secondary"
              fontSize="label.md"
              lineHeight="18px"
              lineClamp={2}
              whiteSpace="normal"
              wordBreak="break-word"
              appearance="none"
              cursor="pointer"
              transition="background 140ms ease, border-color 140ms ease"
              _hover={{
                bg: "background.neutral",
                borderColor: "interactive.primary",
                color: "interactive.primary",
              }}
            >
              {question.label}
            </chakra.button>
          ))}
        </Flex>
      </Box>
    </Box>
  );
}

export function ClimaChatPanel({ actions, state }: ClimaChatPanelProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const inventoryId = getParamValueRequired(params.inventory);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const { t: tDrawer } = useTranslation(lng, "data");
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowChatRef = useRef(true);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const [viewSourceId, setViewSourceId] = useState<string | null>(null);
  const firstPendingDecision =
    state.decisionReviewContext.find(
      (context) => !state.resolvedProposalIds.has(context.proposal_id),
    ) ?? null;
  const focusedContext =
    state.decisionReviewContext.find(
      (context) =>
        context.proposal_id === state.focusedProposalId &&
        !state.resolvedProposalIds.has(context.proposal_id),
    ) ?? firstPendingDecision;
  const suggestedQuestions = buildSuggestedQuestions(
    t,
    state.stage,
    focusedContext,
  );
  const showSuggestedQuestions =
    !state.showStaleWarning &&
    state.loadingAction !== "chat" &&
    suggestedQuestions.length > 0;
  const { chatInput } = state;
  const lastChatMessage = state.chatMessages[state.chatMessages.length - 1];
  const lastChatMessageText =
    lastChatMessage?.kind === "text" ? lastChatMessage.text : "";

  const handleChatScroll = useCallback(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) {
      return;
    }

    const distanceFromBottom =
      scrollRegion.scrollHeight -
      scrollRegion.scrollTop -
      scrollRegion.clientHeight;
    shouldFollowChatRef.current = distanceFromBottom < 140;
  }, []);

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

  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) {
      return;
    }

    const shouldFollow =
      shouldFollowChatRef.current ||
      state.loadingAction === "chat" ||
      lastChatMessage?.kind === "text";
    if (!shouldFollow) {
      return;
    }

    const scrollToBottom = () => {
      scrollRegion.scrollTo({
        top: scrollRegion.scrollHeight,
        behavior: state.loadingAction === "chat" ? "auto" : "smooth",
      });
    };

    const animationFrame = window.requestAnimationFrame(scrollToBottom);
    const timeout = window.setTimeout(scrollToBottom, 80);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [
    lastChatMessage?.id,
    lastChatMessage?.kind,
    lastChatMessageText,
    state.chatMessages.length,
    state.loadingAction,
  ]);

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
                const context = state.decisionReviewContext.find(
                  (candidate) => candidate.proposal_id === message.proposalId,
                );
                if (!context) {
                  return null;
                }

                const resolved = state.resolvedProposalIds.has(
                  context.proposal_id,
                );
                const focusRow = () =>
                  actions.setFocusedProposal(context.proposal_id);

                return (
                  <Box
                    key={message.id}
                    w="full"
                    maxW={CHAT_SURFACE_MAX_W}
                    alignSelf="center"
                    transform={CHAT_WIDGET_TRANSFORM}
                    onMouseEnter={focusRow}
                    onFocus={focusRow}
                  >
                    {resolved ? (
                      <ActionCompletedDecisionCard
                        context={context}
                        decision={state.decisionState[context.proposal_id]}
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
                    )}
                  </Box>
                );
              }

              if (message.kind === "inventory_save_confirmation") {
                return (
                  <InventorySaveConfirmationCard
                    key={message.id}
                    disabled={!state.canSaveToInventory}
                    loading={state.loadingAction === "save_inventory"}
                    onCancel={actions.cancelSaveToInventoryConfirmation}
                    onConfirm={actions.confirmSaveToInventory}
                  />
                );
              }

              if (
                message.kind === "stationary_energy_bulk_review_confirmation"
              ) {
                return (
                  <BulkReviewConfirmationCard
                    key={message.id}
                    choices={message.choices}
                    blockedChoices={message.blockedChoices}
                    disabled={message.choices.length === 0}
                    loading={state.loadingAction === "chat"}
                    message={message.message}
                    onCancel={actions.cancelBulkReviewChanges}
                    onConfirm={() =>
                      actions.confirmBulkReviewChanges(message.choices)
                    }
                  />
                );
              }

              if (
                message.kind ===
                "stationary_energy_staged_review_update_confirmation"
              ) {
                return (
                  <StagedReviewUpdateConfirmationCard
                    key={message.id}
                    mode={message.mode}
                    choices={message.choices}
                    blockedChoices={message.blockedChoices}
                    disabled={message.choices.length === 0}
                    loading={state.loadingAction === "chat"}
                    message={message.message}
                    onCancel={actions.cancelStagedReviewUpdate}
                    onConfirm={() =>
                      message.mode === "rollback"
                        ? actions.confirmStagedReviewRollback(message.choices)
                        : actions.confirmBulkReviewChanges(message.choices)
                    }
                  />
                );
              }

              if (message.kind === "stationary_energy_tool_summary") {
                return (
                  <StationaryEnergyToolSummaryCard
                    key={message.id}
                    action={message.action}
                    message={message.message}
                    selectedChoices={message.selectedChoices}
                    blockedChoices={message.blockedChoices}
                  />
                );
              }

              if (message.role === "user") {
                return <UserBubble key={message.id} text={message.text} />;
              }

              const isActiveThinkingMessage =
                state.loadingAction === "chat" &&
                message.id === lastChatMessage?.id;
              if (!message.text.trim() && !isActiveThinkingMessage) {
                return null;
              }

              return (
                <AgentBubble
                  key={message.id}
                  text={
                    message.text ||
                    (isActiveThinkingMessage ? t("chat-panel-thinking") : "")
                  }
                />
              );
            })}
          </>
        )}
      </VStack>

      {showSuggestedQuestions ? (
        <SuggestedQuestions
          questions={suggestedQuestions}
          onAsk={actions.sendChatMessage}
        />
      ) : null}

      <Box
        data-testid="clima-chat-composer"
        px={{ base: 3, md: 6 }}
        py={3}
        bg="background.backgroundGreyFlat"
      >
        <form
          onSubmit={actions.submitChat}
          style={{ width: "100%", maxWidth: "900px", margin: "0 auto" }}
        >
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
