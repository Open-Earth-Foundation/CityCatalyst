"use client";

import {
  AgentBubble,
  CoveragePanel,
  QuickReplies,
  RunSummary,
  StatusLine,
  UserBubble,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-primitives";
import type {
  DecisionReviewContext,
  DraftCounts,
  DraftStage,
} from "@/components/StationaryEnergyDraft/flow";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";

type StageMessagesProps = {
  stage: DraftStage;
  draftState: DraftStatusResponse | null;
  counts: DraftCounts;
  pendingDecisionCount: number;
  decisionReviewContext: DecisionReviewContext[];
  canPersistDraftReview: boolean;
  canSaveToInventory: boolean;
  hasSourceBackedProposals: boolean;
  sourcePreference: string | null;
  sourcePreferenceOptions: string[];
  onPreference: (preference: string) => void;
  onSaveDraft: () => void;
  onSaveToInventory: () => void;
  onStartDraft: () => void;
};

function decisionStageLabel(pendingDecisionCount: number): string {
  return pendingDecisionCount === 1
    ? "1 row needs decision review"
    : `${pendingDecisionCount} rows need decision review`;
}

function reviewCompletionMessage(props: StageMessagesProps): string {
  if (props.canSaveToInventory) {
    return "Done. Review the working draft on the left, save it in Clima, or commit it to the inventory when you are ready.";
  }
  if (props.canPersistDraftReview) {
    return "Review complete. Save this draft in Clima now if you want to come back later.";
  }
  return "Review complete. Nothing is ready to save yet.";
}

function reviewEmptyStateMessage(props: StageMessagesProps): string {
  return props.hasSourceBackedProposals
    ? "Review complete. No source-backed rows are staged to save."
    : "No source-backed proposals are available to save from the current connected datasets.";
}

function reviewQuickReplies(props: StageMessagesProps) {
  return [
    ...(props.canPersistDraftReview
      ? [
          {
            label: "Save draft",
            onClick: props.onSaveDraft,
          },
        ]
      : []),
    ...(props.canSaveToInventory
      ? [
          {
            label: "Save to inventory",
            primary: true,
            onClick: props.onSaveToInventory,
          },
        ]
      : []),
    {
      label: "Set notation for empty ones",
      onClick: () => props.onPreference("Set notation for empty ones"),
    },
  ];
}

function draftingPreferenceButtons(props: StageMessagesProps) {
  return [
    ...props.sourcePreferenceOptions.map((sourceName) => ({
      label: `Prefer ${sourceName}`,
      onClick: () => props.onPreference(`Prefer ${sourceName}`),
    })),
    {
      label: "No preference",
      onClick: () => props.onPreference("No preference"),
    },
  ];
}

export function StageMessages(props: StageMessagesProps) {
  if (props.stage === "start") {
    return (
      <>
        <AgentBubble text="I can help complete the Stationary Energy sector using third-party data already integrated with this inventory." />
        <CoveragePanel
          sourceCount={props.draftState?.source_candidates.length ?? null}
          currentCount={props.counts.total}
        />
        <AgentBubble text="Want me to draft the empty rows? You can review every value before saving." />
        <QuickReplies
          buttons={[
            {
              label: "Yes, draft them",
              primary: true,
              onClick: props.onStartDraft,
            },
            {
              label: "Let me choose sources",
              onClick: () => props.onPreference("Let me choose sources"),
            },
          ]}
        />
      </>
    );
  }

  if (props.stage === "drafting") {
    return (
      <>
        <AgentBubble text="Starting now. I will draft each empty Stationary Energy row from the integrated sources." />
        <QuickReplies buttons={draftingPreferenceButtons(props)} />
        {props.sourcePreference ? (
          <UserBubble text={props.sourcePreference} />
        ) : null}
        <StatusLine text="Drafting rows and comparing source coverage..." />
      </>
    );
  }

  if (props.stage === "decision" && props.pendingDecisionCount > 0) {
    return (
      <AgentBubble
        text={`Most rows are drafted. ${decisionStageLabel(props.pendingDecisionCount)}; I marked those reviews below and will keep them in this chat history while we discuss anything else.`}
      />
    );
  }

  if (props.draftState?.status === "saved") {
    return (
      <>
        <AgentBubble text="Saved. The reviewed source-backed rows are already committed to the inventory." />
        <RunSummary
          counts={props.counts}
          pendingDecisionCount={props.pendingDecisionCount}
        />
      </>
    );
  }

  if (
    props.decisionReviewContext.length === 0 &&
    !props.canSaveToInventory &&
    !props.canPersistDraftReview
  ) {
    return (
      <>
        <AgentBubble text={reviewEmptyStateMessage(props)} />
        <RunSummary
          counts={props.counts}
          pendingDecisionCount={props.pendingDecisionCount}
        />
        <AgentBubble text="Rows without a usable source can stay empty or be handled later with a notation key." />
      </>
    );
  }

  return (
    <>
      <AgentBubble text={reviewCompletionMessage(props)} />
      <RunSummary
        counts={props.counts}
        pendingDecisionCount={props.pendingDecisionCount}
      />
      <AgentBubble text="Rows without a usable source can stay empty or be handled later with a notation key." />
      {props.canPersistDraftReview || props.canSaveToInventory ? (
        <QuickReplies buttons={reviewQuickReplies(props)} />
      ) : null}
    </>
  );
}
