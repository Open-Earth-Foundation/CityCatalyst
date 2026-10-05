import type { TFunction } from "i18next";
import type { FormEvent } from "react";
import { type SourcePreferenceCommand } from "@/components/StationaryEnergyDraft/source-preference";
import {
  type ChatMessage,
  type StationaryEnergyToolChoiceSummary,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import {
  type ArtifactRow,
  type DecisionReviewContext,
  type DraftCounts,
  type DraftStage,
} from "@/components/StationaryEnergyDraft/flow";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftListItem,
  DraftProposal,
  DraftStatusResponse,
} from "@/components/StationaryEnergyDraft/types";

export type LoadingAction =
  "start" | "refresh" | "save_draft" | "save_inventory" | "chat" | null;

export type ErrorRecoveryAction = "start_draft";

export type UseStationaryEnergyChatArtifactControllerParams = {
  cityId: string;
  cityName?: string | null;
  featureEnabled: boolean;
  initialStage: DraftStage;
  inventoryId: string;
  inventoryYear?: number | null;
  lng: string;
  queryDraftRunId: string | null;
  t: TFunction;
};

export type StationaryEnergyChatArtifactControllerState = {
  activeDraftRunId: string | null;
  activeProposalId: string | null;
  canPersistDraftReview: boolean;
  canSaveToInventory: boolean;
  // What the agent is doing right now, shown as a chat bubble while it works.
  chatActivityLabel: string | null;
  chatInput: string;
  chatMessages: ChatMessage[];
  counts: DraftCounts;
  decisionReviewContext: DecisionReviewContext[];
  decisionState: Record<string, DraftDecisionState>;
  draftListLoading: boolean;
  draftRuns: DraftListItem[];
  draftState: DraftStatusResponse | null;
  draftStatus: string;
  errorMessage: string | null;
  errorRecoveryAction: ErrorRecoveryAction | null;
  focusedProposalId: string | null;
  hasDraft: boolean;
  hasSourceBackedProposals: boolean;
  loadingAction: LoadingAction;
  pendingDecisionCount: number;
  pendingDraftStartRequest: string | null;
  draftStartResumeNotice: string | null;
  resolvedProposalIds: Set<string>;
  rows: ArtifactRow[];
  showStaleWarning: boolean;
  sourcePreference: SourcePreferenceCommand | null;
  sourcePreferenceOptions: string[];
  stage: DraftStage;
  staleDraft: DraftStatusResponse["staleness"];
  unresolvedCount: number;
};

export type StationaryEnergyChatArtifactControllerActions = {
  cancelDraftStartResume: () => void;
  chooseDecision: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  choosePreference: (preference: SourcePreferenceCommand) => void;
  continueStaleDraft: () => void;
  confirmBulkReviewChanges: (
    choices: StationaryEnergyToolChoiceSummary[],
  ) => void;
  cancelBulkReviewChanges: () => void;
  confirmStagedReviewRollback: (
    choices: StationaryEnergyToolChoiceSummary[],
  ) => void;
  cancelStagedReviewUpdate: () => void;
  confirmSaveToInventory: () => void;
  requestSaveToInventoryConfirmation: () => void;
  cancelSaveToInventoryConfirmation: () => void;
  editDecision: (proposalId: string) => void;
  refreshActiveDraft: () => void;
  saveDraft: () => void;
  saveToInventory: () => void;
  selectDraft: (draftRunId: string) => void;
  sendChatMessage: (content: string) => void;
  setChatInput: (value: string) => void;
  setFocusedProposal: (proposalId: string | null) => void;
  startDraftFromArtifact: () => void;
  startDraftFromChat: () => void;
  startOver: () => void;
  stopChat: () => void;
  submitChat: (event: FormEvent<HTMLFormElement>) => void;
};

export type StationaryEnergyChatArtifactController = {
  actions: StationaryEnergyChatArtifactControllerActions;
  state: StationaryEnergyChatArtifactControllerState;
};
