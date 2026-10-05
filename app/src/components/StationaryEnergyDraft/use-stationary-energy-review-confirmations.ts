"use client";

import type { UseStationaryEnergyChatArtifactControllerParams } from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import { type StationaryEnergyToolChoiceSummary } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import type { useStationaryEnergyChatMessages } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-messages";
import type { useStationaryEnergyChatStream } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-stream";
import type { RefObject } from "react";
import { useCallback, useEffect } from "react";

type ConfirmationParams = {
  t: UseStationaryEnergyChatArtifactControllerParams["t"];
  canSaveAcceptedRowsToInventory: boolean;
  pendingInventorySaveConfirmationMessageRef: RefObject<
    string | null | undefined
  >;
  saveToInventory: () => Promise<void>;
  sendChatMessage: ReturnType<
    typeof useStationaryEnergyChatStream
  >["sendChatMessage"];
  chat: ReturnType<typeof useStationaryEnergyChatMessages>;
};
export function useStationaryEnergyReviewConfirmations(
  params: ConfirmationParams,
) {
  const {
    t,
    canSaveAcceptedRowsToInventory,
    pendingInventorySaveConfirmationMessageRef,
    saveToInventory,
    sendChatMessage,
    chat,
  } = params;
  const {
    appendTextMessage,
    appendInventorySaveConfirmation,
    removeInventorySaveConfirmationMessages,
    removeBulkReviewConfirmationMessages,
    removeStagedReviewUpdateConfirmationMessages,
  } = chat;
  useEffect(() => {
    if (!canSaveAcceptedRowsToInventory) {
      removeInventorySaveConfirmationMessages();
      return;
    }

    const pendingMessage = pendingInventorySaveConfirmationMessageRef.current;
    if (pendingMessage !== undefined) {
      pendingInventorySaveConfirmationMessageRef.current = undefined;
      removeInventorySaveConfirmationMessages();
      if (pendingMessage) {
        appendTextMessage("assistant", pendingMessage);
      }
      appendInventorySaveConfirmation();
    }
  }, [
    appendInventorySaveConfirmation,
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    pendingInventorySaveConfirmationMessageRef,
    removeInventorySaveConfirmationMessages,
  ]);
  const requestSaveToInventoryConfirmation = useCallback((): void => {
    if (!canSaveAcceptedRowsToInventory) {
      pendingInventorySaveConfirmationMessageRef.current = undefined;
      appendTextMessage("assistant", t("chat-save-inventory-blocked"));
      return;
    }
    pendingInventorySaveConfirmationMessageRef.current = undefined;
    appendTextMessage("assistant", t("chat-save-inventory-confirm"));
    appendInventorySaveConfirmation();
  }, [
    appendInventorySaveConfirmation,
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    pendingInventorySaveConfirmationMessageRef,
    t,
  ]);

  const confirmSaveToInventory = useCallback((): void => {
    pendingInventorySaveConfirmationMessageRef.current = undefined;
    removeInventorySaveConfirmationMessages();
    appendTextMessage("user", t("chat-save-inventory-confirmed"));
    void saveToInventory();
  }, [
    appendTextMessage,
    removeInventorySaveConfirmationMessages,
    saveToInventory,
    pendingInventorySaveConfirmationMessageRef,
    t,
  ]);

  const cancelSaveToInventoryConfirmation = useCallback((): void => {
    pendingInventorySaveConfirmationMessageRef.current = undefined;
    removeInventorySaveConfirmationMessages();
    appendTextMessage("assistant", t("chat-save-inventory-canceled"));
  }, [
    appendTextMessage,
    removeInventorySaveConfirmationMessages,
    pendingInventorySaveConfirmationMessageRef,
    t,
  ]);
  const confirmBulkReviewChanges = useCallback(
    (choices: StationaryEnergyToolChoiceSummary[]): void => {
      removeBulkReviewConfirmationMessages();
      removeStagedReviewUpdateConfirmationMessages();
      void sendChatMessage(t("chat-bulk-review-confirmed"), {
        confirmedBulkReviewChoices: choices,
      });
    },
    [
      removeBulkReviewConfirmationMessages,
      removeStagedReviewUpdateConfirmationMessages,
      sendChatMessage,
      t,
    ],
  );

  const cancelBulkReviewChanges = useCallback((): void => {
    removeBulkReviewConfirmationMessages();
    appendTextMessage("assistant", t("chat-bulk-review-canceled"));
    if (canSaveAcceptedRowsToInventory) {
      requestSaveToInventoryConfirmation();
    }
  }, [
    appendTextMessage,
    canSaveAcceptedRowsToInventory,
    removeBulkReviewConfirmationMessages,
    requestSaveToInventoryConfirmation,
    t,
  ]);

  const confirmStagedReviewRollback = useCallback(
    (choices: StationaryEnergyToolChoiceSummary[]): void => {
      removeStagedReviewUpdateConfirmationMessages();
      void sendChatMessage(t("chat-staged-review-rollback-confirmed"), {
        confirmedRollbackReviewChoices: choices,
      });
    },
    [removeStagedReviewUpdateConfirmationMessages, sendChatMessage, t],
  );

  const cancelStagedReviewUpdate = useCallback((): void => {
    removeStagedReviewUpdateConfirmationMessages();
    appendTextMessage("assistant", t("chat-staged-review-update-canceled"));
  }, [appendTextMessage, removeStagedReviewUpdateConfirmationMessages, t]);

  return {
    requestSaveToInventoryConfirmation,
    confirmSaveToInventory,
    cancelSaveToInventoryConfirmation,
    confirmBulkReviewChanges,
    cancelBulkReviewChanges,
    confirmStagedReviewRollback,
    cancelStagedReviewUpdate,
  };
}
