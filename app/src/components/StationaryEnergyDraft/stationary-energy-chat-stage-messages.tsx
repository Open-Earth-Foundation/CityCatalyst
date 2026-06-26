"use client";

import type { TFunction } from "i18next";
import { useParams } from "next/navigation";

import {
  AgentBubble,
  QuickReplies,
  RunSummary,
  StationaryEnergyChatWelcome,
  StatusLine,
  UserBubble,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-primitives";
import {
  buildSourcePreferenceLabel,
  NO_SOURCE_PREFERENCE,
  SET_EMPTY_NOTATION_PREFERENCE,
  sourcePreferenceCommand,
  START_CHOOSE_SOURCES,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import type {
  DecisionReviewContext,
  DraftCounts,
  DraftStage,
} from "@/components/StationaryEnergyDraft/flow";
import { useTranslation } from "@/i18n/client";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import { getParamValueRequired } from "@/util/helpers";

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

function decisionStageLabel(
  t: TFunction,
  pendingDecisionCount: number,
): string {
  return pendingDecisionCount === 1
    ? t("chat-decision-stage-label-one")
    : t("chat-decision-stage-label-many", { count: pendingDecisionCount });
}

function reviewCompletionMessage(
  t: TFunction,
  props: StageMessagesProps,
): string {
  if (props.canSaveToInventory) {
    return t("chat-review-completion-can-save-inventory");
  }
  if (props.canPersistDraftReview) {
    return t("chat-review-completion-can-save-draft");
  }
  return t("chat-review-completion-nothing-ready");
}

function reviewEmptyStateMessage(
  t: TFunction,
  props: StageMessagesProps,
): string {
  return props.hasSourceBackedProposals
    ? t("chat-review-empty-state-has-proposals")
    : t("chat-review-empty-state-no-proposals");
}

function reviewQuickReplies(t: TFunction, props: StageMessagesProps) {
  return [
    ...(props.canPersistDraftReview
      ? [
          {
            label: t("chat-quick-reply-save-draft"),
            onClick: props.onSaveDraft,
          },
        ]
      : []),
    ...(props.canSaveToInventory
      ? [
          {
            label: t("chat-quick-reply-save-to-inventory"),
            primary: true,
            onClick: props.onSaveToInventory,
          },
        ]
      : []),
    {
      label: t("chat-quick-reply-set-notation"),
      onClick: () => props.onPreference(SET_EMPTY_NOTATION_PREFERENCE),
    },
  ];
}

function draftingPreferenceButtons(t: TFunction, props: StageMessagesProps) {
  return [
    ...props.sourcePreferenceOptions.map((sourceName) => ({
      label: t("chat-source-preference-prefer", { sourceName }),
      onClick: () => props.onPreference(sourcePreferenceCommand(sourceName)),
    })),
    {
      label: t("chat-source-preference-no-preference"),
      onClick: () => props.onPreference(NO_SOURCE_PREFERENCE),
    },
  ];
}

export function StageMessages(props: StageMessagesProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");

  if (props.stage === "start") {
    return (
      <StationaryEnergyChatWelcome
        onStartDraft={props.onStartDraft}
        onChooseSources={() => props.onPreference(START_CHOOSE_SOURCES)}
      />
    );
  }

  if (props.stage === "drafting") {
    return (
      <>
        <AgentBubble text={t("chat-drafting-started")} />
        <QuickReplies
          standalone
          buttons={draftingPreferenceButtons(t, props)}
        />
        {props.sourcePreference ? (
          <UserBubble
            text={buildSourcePreferenceLabel(t, props.sourcePreference)}
          />
        ) : null}
        <StatusLine text={t("chat-drafting-status")} />
      </>
    );
  }

  if (props.stage === "decision" && props.pendingDecisionCount > 0) {
    return (
      <>
        <AgentBubble
          text={t("chat-decision-summary", {
            pendingDecisionLabel: decisionStageLabel(
              t,
              props.pendingDecisionCount,
            ),
          })}
        />
        {props.canSaveToInventory ? (
          <QuickReplies standalone buttons={reviewQuickReplies(t, props)} />
        ) : null}
      </>
    );
  }

  if (props.draftState?.status === "saved") {
    return (
      <>
        <AgentBubble text={t("chat-saved-summary")} />
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
        <AgentBubble text={reviewEmptyStateMessage(t, props)} />
        <RunSummary
          counts={props.counts}
          pendingDecisionCount={props.pendingDecisionCount}
        />
        <AgentBubble text={t("chat-review-later-notation")} />
      </>
    );
  }

  return (
    <>
      <AgentBubble text={reviewCompletionMessage(t, props)} />
      <RunSummary
        counts={props.counts}
        pendingDecisionCount={props.pendingDecisionCount}
      />
      <AgentBubble text={t("chat-review-later-notation")} />
      {props.canPersistDraftReview || props.canSaveToInventory ? (
        <QuickReplies standalone buttons={reviewQuickReplies(t, props)} />
      ) : null}
    </>
  );
}
