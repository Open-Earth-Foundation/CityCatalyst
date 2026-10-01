"use client";

import { useCallback, useEffect, useState } from "react";
import type { DecisionReviewContext } from "@/components/StationaryEnergyDraft/flow";
import { mergeDecisionReviewMessages } from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import {
  appendAssistantDeltaToMessages,
  createBulkReviewConfirmationMessage,
  createInventorySaveConfirmationMessage,
  createStagedReviewUpdateConfirmationMessage,
  createTextMessage,
  removeEmptyAssistantTailFromMessages,
  type ChatMessage,
  type ChatTextMessage,
  type StationaryEnergyToolChoiceSummary,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";

export function useStationaryEnergyChatMessages(
  decisionReviewContext: DecisionReviewContext[],
) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  useEffect(() => {
    setChatMessages((current) =>
      mergeDecisionReviewMessages(current, decisionReviewContext),
    );
  }, [decisionReviewContext]);
  const appendTextMessage = useCallback(
    (role: ChatTextMessage["role"], text: string): void => {
      setChatMessages((current) => [...current, createTextMessage(role, text)]);
    },
    [],
  );

  const removeInventorySaveConfirmationMessages = useCallback((): void => {
    setChatMessages((current) =>
      current.filter(
        (message) => message.kind !== "inventory_save_confirmation",
      ),
    );
  }, []);

  const removeBulkReviewConfirmationMessages = useCallback((): void => {
    setChatMessages((current) =>
      current.filter(
        (message) =>
          message.kind !== "stationary_energy_bulk_review_confirmation",
      ),
    );
  }, []);

  const removeStagedReviewUpdateConfirmationMessages = useCallback((): void => {
    setChatMessages((current) =>
      current.filter(
        (message) =>
          message.kind !==
          "stationary_energy_staged_review_update_confirmation",
      ),
    );
  }, []);

  const appendInventorySaveConfirmation = useCallback((): void => {
    setChatMessages((current) => [
      ...current.filter(
        (message) => message.kind !== "inventory_save_confirmation",
      ),
      createInventorySaveConfirmationMessage(),
    ]);
  }, []);

  const appendBulkReviewConfirmation = useCallback(
    (params: {
      message?: string | null;
      choices: StationaryEnergyToolChoiceSummary[];
      blockedChoices: StationaryEnergyToolChoiceSummary[];
    }): void => {
      setChatMessages((current) => [
        ...current.filter(
          (message) =>
            message.kind !== "stationary_energy_bulk_review_confirmation",
        ),
        createBulkReviewConfirmationMessage(params),
      ]);
    },
    [],
  );

  const appendStagedReviewUpdateConfirmation = useCallback(
    (params: {
      mode: "change" | "rollback";
      message?: string | null;
      choices: StationaryEnergyToolChoiceSummary[];
      blockedChoices: StationaryEnergyToolChoiceSummary[];
    }): void => {
      setChatMessages((current) => [
        ...current.filter(
          (message) =>
            message.kind !==
            "stationary_energy_staged_review_update_confirmation",
        ),
        createStagedReviewUpdateConfirmationMessage(params),
      ]);
    },
    [],
  );

  const appendAssistantDelta = useCallback((delta: string): void => {
    setChatMessages((current) =>
      appendAssistantDeltaToMessages(current, delta),
    );
  }, []);

  const removeEmptyAssistantTail = useCallback((): void => {
    setChatMessages((current) => removeEmptyAssistantTailFromMessages(current));
  }, []);
  return {
    chatMessages,
    setChatMessages,
    appendTextMessage,
    removeInventorySaveConfirmationMessages,
    removeBulkReviewConfirmationMessages,
    removeStagedReviewUpdateConfirmationMessages,
    appendInventorySaveConfirmation,
    appendBulkReviewConfirmation,
    appendStagedReviewUpdateConfirmation,
    appendAssistantDelta,
    removeEmptyAssistantTail,
  };
}
