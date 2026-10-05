"use client";
import {
  useCallback,
  useRef,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TFunction } from "i18next";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import type { DecisionReviewContext } from "@/components/StationaryEnergyDraft/flow";
import type { ErrorRecoveryAction } from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import type { useStationaryEnergyChatMessages } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-messages";
import type { useStationaryEnergyPendingRequest } from "@/components/StationaryEnergyDraft/use-stationary-energy-pending-request";
import {
  isStationaryEnergyStartDraftToolResult,
  resolveDraftStartResume,
  resolveInventorySaveConfirmationRequest,
  resolveStationaryEnergyStartDraftFailureMessage,
  resolveStationaryEnergyToolMessage,
  toolStartedEventName,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import {
  isStationaryEnergyReviewToolResult,
  isStationaryEnergyInventoryConfirmationToolResult,
  isStationaryEnergyBulkReviewConfirmationToolResult,
  isStationaryEnergyStagedReviewUpdateConfirmationToolResult,
  summarizeToolChoices,
  stationaryEnergyToolResultSignature,
  resolveErrorMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-tool-helpers";
import { createStationaryEnergyToolSummaryMessage } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
type ToolResultParams = {
  t: TFunction;
  draftState: DraftStatusResponse | null;
  decisionReviewContext: DecisionReviewContext[];
  canSaveAcceptedRowsToInventory: boolean;
  canSaveAcceptedRowsToInventoryRef: RefObject<boolean>;
  lastUserChatContentRef: RefObject<string | null>;
  pendingInventorySaveConfirmationMessageRef: RefObject<
    string | null | undefined
  >;
  setAcknowledgedStaleDraftRunId: Dispatch<SetStateAction<string | null>>;
  refreshDraftStatusSilently: (draftRunId: string) => Promise<unknown>;
  clearError: () => void;
  showError: (message: string, recovery?: ErrorRecoveryAction | null) => void;
  updatePendingDraftStartResume: ReturnType<
    typeof useStationaryEnergyPendingRequest
  >["updatePendingDraftStartResume"];
  messages: ReturnType<typeof useStationaryEnergyChatMessages>;
};
export function useStationaryEnergyToolResults(params: ToolResultParams) {
  const {
    t,
    draftState,
    decisionReviewContext,
    canSaveAcceptedRowsToInventory,
    canSaveAcceptedRowsToInventoryRef,
    lastUserChatContentRef,
    pendingInventorySaveConfirmationMessageRef,
    setAcknowledgedStaleDraftRunId,
    refreshDraftStatusSilently,
    clearError,
    showError,
    updatePendingDraftStartResume,
    messages,
  } = params;
  const {
    appendBulkReviewConfirmation,
    appendInventorySaveConfirmation,
    appendStagedReviewUpdateConfirmation,
    appendTextMessage,
    removeEmptyAssistantTail,
    removeInventorySaveConfirmationMessages,
    setChatMessages,
  } = messages;
  const handledToolResultSignaturesRef = useRef<Set<string>>(new Set());
  const pendingDraftStatusRefreshCountRef = useRef(0);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const handleToolResult = useCallback(
    (tool: unknown): void => {
      const startedToolName = toolStartedEventName(tool);
      if (startedToolName) {
        setActiveToolName(startedToolName);
        return;
      }
      setActiveToolName(null);

      const signature = stationaryEnergyToolResultSignature(tool);
      removeEmptyAssistantTail();
      if (signature) {
        if (handledToolResultSignaturesRef.current.has(signature)) {
          return;
        }
        handledToolResultSignaturesRef.current.add(signature);
      }

      const toolDraftRunId =
        typeof (tool as { draft_run_id?: unknown } | null)?.draft_run_id ===
        "string"
          ? (tool as { draft_run_id: string }).draft_run_id
          : draftState?.draft_run_id;
      if (toolDraftRunId) {
        setAcknowledgedStaleDraftRunId(toolDraftRunId);
      }

      // The agent started a draft from chat: load the newly created draft so the
      // overview + review pane pick it up. Generation continues in the
      // background and the status poller fills in proposals as they arrive.
      const toolUiEvent =
        typeof (tool as { ui_event?: unknown } | null)?.ui_event === "string"
          ? (tool as { ui_event: string }).ui_event
          : null;
      if (toolUiEvent === "stationary_energy_draft_started") {
        const failureMessage = resolveStationaryEnergyStartDraftFailureMessage(
          t,
          tool,
        );
        if (failureMessage) {
          showError(failureMessage, "start_draft");
          return;
        }

        if (!isStationaryEnergyStartDraftToolResult(tool) || !toolDraftRunId) {
          showError(
            t("error-failed-to-start-stationary-energy-draft-retry"),
            "start_draft",
          );
          return;
        }

        clearError();
        const resume = resolveDraftStartResume(
          tool,
          toolDraftRunId,
          lastUserChatContentRef.current,
        );
        if (resume) {
          updatePendingDraftStartResume(resume);
        }
        void refreshDraftStatusSilently(toolDraftRunId).catch((error) => {
          showError(
            resolveErrorMessage(
              t,
              error,
              "error-failed-to-load-stationary-energy-draft-status",
            ),
          );
        });
        return;
      }

      if (isStationaryEnergyInventoryConfirmationToolResult(tool)) {
        const canSaveAcceptedRowsToInventoryNow =
          canSaveAcceptedRowsToInventory ||
          canSaveAcceptedRowsToInventoryRef.current;
        const toolMessage = resolveStationaryEnergyToolMessage(
          t,
          tool,
          tool.success
            ? "tool-message-inventory-save-confirm"
            : "error-failed-to-save-accepted-stationary-energy-rows",
        );
        const confirmationRequest = resolveInventorySaveConfirmationRequest({
          canSaveToInventory: canSaveAcceptedRowsToInventoryNow,
          toolSuccess: tool.success,
          toolMessage,
          blockedMessage: t("chat-save-inventory-blocked"),
        });
        removeInventorySaveConfirmationMessages();
        if (
          tool.success &&
          !canSaveAcceptedRowsToInventoryNow &&
          pendingDraftStatusRefreshCountRef.current > 0
        ) {
          pendingInventorySaveConfirmationMessageRef.current =
            toolMessage ?? null;
          return;
        }
        if (confirmationRequest.message) {
          appendTextMessage("assistant", confirmationRequest.message);
        }
        if (confirmationRequest.showConfirmation) {
          appendInventorySaveConfirmation();
        }
        return;
      }

      if (isStationaryEnergyBulkReviewConfirmationToolResult(tool)) {
        const choices = summarizeToolChoices(
          tool.pending_choices ?? [],
          decisionReviewContext,
        );
        const blockedChoices = summarizeToolChoices(
          tool.blocked_choices ?? [],
          decisionReviewContext,
        );
        const toolMessage = resolveStationaryEnergyToolMessage(
          t,
          tool,
          "primitives-bulk-review-confirm-description",
        );
        appendBulkReviewConfirmation({
          message: toolMessage,
          choices,
          blockedChoices,
        });
        return;
      }

      if (isStationaryEnergyStagedReviewUpdateConfirmationToolResult(tool)) {
        const choices = summarizeToolChoices(
          tool.pending_choices ?? [],
          decisionReviewContext,
        );
        const blockedChoices = summarizeToolChoices(
          tool.blocked_choices ?? [],
          decisionReviewContext,
        );
        const mode =
          tool.ui_event ===
          "stationary_energy_review_rollback_confirmation_requested"
            ? "rollback"
            : "change";
        const toolMessage = resolveStationaryEnergyToolMessage(
          t,
          tool,
          mode === "rollback"
            ? "primitives-staged-review-rollback-confirm-description"
            : "primitives-staged-review-change-confirm-description",
        );
        appendStagedReviewUpdateConfirmation({
          mode,
          message: toolMessage,
          choices,
          blockedChoices,
        });
        return;
      }

      if (!isStationaryEnergyReviewToolResult(tool)) {
        return;
      }

      const selectedChoices = summarizeToolChoices(
        tool.selected_choices ?? [],
        decisionReviewContext,
      );
      const blockedChoices = summarizeToolChoices(
        tool.blocked_choices ?? [],
        decisionReviewContext,
      );
      const toolMessage = resolveStationaryEnergyToolMessage(
        t,
        tool,
        "tool-message-generic-summary",
      );
      if (
        selectedChoices.length > 0 ||
        blockedChoices.length > 0 ||
        toolMessage
      ) {
        setChatMessages((current) => [
          ...current,
          createStationaryEnergyToolSummaryMessage({
            action: tool.action ?? "stationary_energy_review_tool",
            message: toolMessage,
            selectedChoices,
            blockedChoices,
          }),
        ]);
      }

      if (toolDraftRunId) {
        pendingDraftStatusRefreshCountRef.current += 1;
        void refreshDraftStatusSilently(toolDraftRunId)
          .catch((error) => {
            showError(
              resolveErrorMessage(
                t,
                error,
                "error-failed-to-load-stationary-energy-draft-status",
              ),
            );
          })
          .finally(() => {
            pendingDraftStatusRefreshCountRef.current = Math.max(
              0,
              pendingDraftStatusRefreshCountRef.current - 1,
            );
          });
      }
    },
    [
      appendBulkReviewConfirmation,
      appendInventorySaveConfirmation,
      appendStagedReviewUpdateConfirmation,
      appendTextMessage,
      canSaveAcceptedRowsToInventory,
      clearError,
      decisionReviewContext,
      draftState?.draft_run_id,
      refreshDraftStatusSilently,
      removeEmptyAssistantTail,
      removeInventorySaveConfirmationMessages,
      showError,
      t,
      updatePendingDraftStartResume,
      canSaveAcceptedRowsToInventoryRef,
      lastUserChatContentRef,
      pendingInventorySaveConfirmationMessageRef,
      setAcknowledgedStaleDraftRunId,
      setChatMessages,
    ],
  );
  return { handleToolResult, activeToolName, setActiveToolName };
}
