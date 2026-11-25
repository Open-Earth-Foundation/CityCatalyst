"use client";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import {
  persistReviewDecisionPayload,
  saveAcceptedDraftRows,
} from "@/components/StationaryEnergyDraft/stationary-energy-draft-api";
import {
  buildReviewDecisionPayload,
  buildInventorySaveReviewDecisionPayload,
  hasInventorySaveReviewChanges,
} from "@/components/StationaryEnergyDraft/flow";
import { resolveErrorMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-tool-helpers";
import type {
  DraftStatusResponse,
  DraftDecisionState,
  SaveResponse,
} from "@/components/StationaryEnergyDraft/types";
import type { LoadingAction } from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import type { ChatTextMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";

type SaveReviewParams = {
  draftState: DraftStatusResponse | null;
  decisionState: Record<string, DraftDecisionState>;
  resolvedProposalIds: Set<string>;
  inventoryId: string;
  canPersistDraft: boolean;
  canSaveAcceptedRowsToInventory: boolean;
  clearError: () => void;
  showError: (message: string) => void;
  setLoadingAction: Dispatch<SetStateAction<LoadingAction>>;
  appendTextMessage: (role: ChatTextMessage["role"], text: string) => void;
  refreshDraftStatus: (draftRunId: string) => Promise<DraftStatusResponse>;
  t: TFunction;
};
export function useStationaryEnergyReviewSave(params: SaveReviewParams) {
  const {
    draftState,
    decisionState,
    resolvedProposalIds,
    inventoryId,
    canPersistDraft,
    canSaveAcceptedRowsToInventory,
    clearError,
    showError,
    setLoadingAction,
    appendTextMessage,
    refreshDraftStatus,
    t,
  } = params;
  const saveDraft = useCallback(async (): Promise<void> => {
    if (!draftState || !canPersistDraft) {
      return;
    }

    clearError();
    setLoadingAction("save_draft");
    try {
      await persistReviewDecisionPayload({
        draftRunId: draftState.draft_run_id,
        inventoryId,
        decisions: buildReviewDecisionPayload({ draftState, decisionState }),
      });
      appendTextMessage("assistant", t("chat-save-draft-success"));
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      showError(
        resolveErrorMessage(
          t,
          error,
          "error-failed-to-save-stationary-energy-draft-decisions",
        ),
      );
    } finally {
      setLoadingAction(null);
    }
  }, [
    appendTextMessage,
    canPersistDraft,
    clearError,
    draftState,
    decisionState,
    inventoryId,
    refreshDraftStatus,
    showError,
    t,
    setLoadingAction,
  ]);

  const saveToInventory = useCallback(async (): Promise<void> => {
    if (!draftState || !canSaveAcceptedRowsToInventory) {
      return;
    }

    clearError();
    setLoadingAction("save_inventory");
    try {
      if (
        hasInventorySaveReviewChanges({
          draftState,
          decisionState,
          resolvedProposalIds,
        })
      ) {
        await persistReviewDecisionPayload({
          draftRunId: draftState.draft_run_id,
          inventoryId,
          decisions: buildInventorySaveReviewDecisionPayload({
            draftState,
            decisionState,
            resolvedProposalIds,
          }),
        });
      }

      const payload: SaveResponse = await saveAcceptedDraftRows({
        draftRunId: draftState.draft_run_id,
        inventoryId,
      });
      appendTextMessage(
        "assistant",
        payload.status === "saved"
          ? t("chat-save-inventory-success")
          : t("chat-save-inventory-status", { status: payload.status }),
      );
      await refreshDraftStatus(draftState.draft_run_id);
    } catch (error) {
      showError(
        resolveErrorMessage(
          t,
          error,
          "error-failed-to-save-accepted-stationary-energy-rows",
        ),
      );
    } finally {
      setLoadingAction(null);
    }
  }, [
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    clearError,
    decisionState,
    draftState,
    inventoryId,
    resolvedProposalIds,
    refreshDraftStatus,
    showError,
    t,
    setLoadingAction,
  ]);
  return { saveDraft, saveToInventory };
}
