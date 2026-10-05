import type {
  StationaryEnergyChatArtifactControllerActions,
  StationaryEnergyChatArtifactControllerState,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";

export type ClimaChatPanelProps = {
  actions: Pick<
    StationaryEnergyChatArtifactControllerActions,
    | "cancelDraftStartResume"
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
    | "chatActivityLabel"
    | "chatInput"
    | "chatMessages"
    | "counts"
    | "decisionReviewContext"
    | "decisionState"
    | "draftState"
    | "errorMessage"
    | "errorRecoveryAction"
    | "focusedProposalId"
    | "hasSourceBackedProposals"
    | "loadingAction"
    | "pendingDecisionCount"
    | "pendingDraftStartRequest"
    | "draftStartResumeNotice"
    | "resolvedProposalIds"
    | "showStaleWarning"
    | "sourcePreference"
    | "sourcePreferenceOptions"
    | "stage"
    | "staleDraft"
  >;
};
