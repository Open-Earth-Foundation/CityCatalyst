"use client";

import type { DecisionReviewContext } from "@/components/StationaryEnergyDraft/flow";
import {
  CHAT_SURFACE_MAX_W,
  CHAT_WIDGET_TRANSFORM,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type { ChatMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import type { ClimaChatPanelProps } from "@/components/StationaryEnergyDraft/stationary-energy-chat-panel-types";
import {
  AgentBubble,
  BulkReviewConfirmationCard,
  InventorySaveConfirmationCard,
  StagedReviewUpdateConfirmationCard,
  StationaryEnergyToolSummaryCard,
  UserBubble,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-primitives";
import {
  ActionCompletedDecisionCard,
  MultiSourceProposalCard,
  SingleSourceProposalCard,
} from "@/components/StationaryEnergyDraft/stationary-energy-review-cards";
import { Box } from "@chakra-ui/react";

type MessageProps = ClimaChatPanelProps & {
  message: ChatMessage;
  context?: DecisionReviewContext;
  handleAskAboutProposal: (label: string) => void;
  setViewSourceId: (sourceId: string) => void;
};
export function StationaryEnergyChatMessage({
  message,
  context,
  state,
  actions,
  handleAskAboutProposal,
  setViewSourceId,
}: MessageProps) {
  if (message.kind === "decision_review") {
    if (!context) {
      return null;
    }

    const resolved = state.resolvedProposalIds.has(context.proposal_id);
    // Focus is set only when the user explicitly asks about this
    // row, so the chat sends the right context — no longer on
    // hover, which made the overview panel mirror the chat.
    const askAboutThisRow = (label: string) => {
      actions.setFocusedProposal(context.proposal_id);
      handleAskAboutProposal(label);
    };

    return (
      <Box
        w="full"
        maxW={CHAT_SURFACE_MAX_W}
        alignSelf="center"
        transform={CHAT_WIDGET_TRANSFORM}
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
            pristine={!resolved}
            onDecisionChoice={actions.chooseDecision}
            onAskAboutProposal={askAboutThisRow}
            onViewSource={setViewSourceId}
          />
        ) : (
          <MultiSourceProposalCard
            context={context}
            decision={state.decisionState[context.proposal_id]}
            resolved={false}
            pristine={!resolved}
            onDecisionChoice={actions.chooseDecision}
            onAskAboutProposal={askAboutThisRow}
            onViewSource={setViewSourceId}
          />
        )}
      </Box>
    );
  }

  if (message.kind === "inventory_save_confirmation") {
    return (
      <InventorySaveConfirmationCard
        disabled={!state.canSaveToInventory}
        loading={state.loadingAction === "save_inventory"}
        onCancel={actions.cancelSaveToInventoryConfirmation}
        onConfirm={actions.confirmSaveToInventory}
      />
    );
  }

  if (message.kind === "stationary_energy_bulk_review_confirmation") {
    return (
      <BulkReviewConfirmationCard
        choices={message.choices}
        blockedChoices={message.blockedChoices}
        disabled={message.choices.length === 0}
        loading={state.loadingAction === "chat"}
        message={message.message}
        onCancel={actions.cancelBulkReviewChanges}
        onConfirm={() => actions.confirmBulkReviewChanges(message.choices)}
      />
    );
  }

  if (message.kind === "stationary_energy_staged_review_update_confirmation") {
    return (
      <StagedReviewUpdateConfirmationCard
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
        action={message.action}
        message={message.message}
        selectedChoices={message.selectedChoices}
        blockedChoices={message.blockedChoices}
      />
    );
  }

  if (message.role === "user") {
    return <UserBubble text={message.text} />;
  }

  if (!message.text.trim()) {
    return null;
  }

  return <AgentBubble text={message.text} />;
}
