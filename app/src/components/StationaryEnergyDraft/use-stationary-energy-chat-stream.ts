"use client";

import type { DecisionReviewContext } from "@/components/StationaryEnergyDraft/flow";
import { canReviewDraftStatus } from "@/components/StationaryEnergyDraft/flow";
import {
  buildFocusedDecisionStatePayload,
  buildStationaryEnergyChatRequest,
  hasTerminalDraftStatus,
  resolveChatActivityLabel,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import type {
  ErrorRecoveryAction,
  LoadingAction,
  UseStationaryEnergyChatArtifactControllerParams,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-types";
import { type StationaryEnergyToolChoiceSummary } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
import {
  confirmedBulkReviewChoicePayload,
  confirmedRollbackReviewChoicePayload,
  resolveErrorMessage,
  translateMessage,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-tool-helpers";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import { useStationaryEnergyChatMessages } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-messages";
import { useStationaryEnergyPendingRequest } from "@/components/StationaryEnergyDraft/use-stationary-energy-pending-request";
import { useSSEStream } from "@/hooks/useSSEStream";
import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";

type ChatStreamParams = Pick<
  UseStationaryEnergyChatArtifactControllerParams,
  "cityId" | "cityName" | "inventoryId" | "inventoryYear" | "t"
> & {
  draftState: DraftStatusResponse | null;
  decisionReviewContext: DecisionReviewContext[];
  focusedDecisionState: ReturnType<typeof buildFocusedDecisionStatePayload>;
  effectiveFocusedProposalId: string | null;
  loadingAction: LoadingAction;
  setLoadingAction: Dispatch<SetStateAction<LoadingAction>>;
  clearError: () => void;
  showError: (
    message: string,
    recoveryAction?: ErrorRecoveryAction | null,
  ) => void;
  ensureThreadId: (required?: boolean) => Promise<string | null>;
  activeToolName: string | null;
  setActiveToolName: Dispatch<SetStateAction<string | null>>;
  handleToolResult: (tool: unknown) => void;
  lastUserChatContentRef: RefObject<string | null>;
  chat: ReturnType<typeof useStationaryEnergyChatMessages>;
  pendingRequest: ReturnType<typeof useStationaryEnergyPendingRequest>;
};
export function useStationaryEnergyChatStream(params: ChatStreamParams) {
  const {
    cityId,
    cityName,
    inventoryId,
    inventoryYear,
    t,
    draftState,
    decisionReviewContext,
    focusedDecisionState,
    effectiveFocusedProposalId,
    loadingAction,
    setLoadingAction,
    clearError,
    showError,
    ensureThreadId,
    activeToolName,
    setActiveToolName,
    handleToolResult,
    lastUserChatContentRef,
    chat,
    pendingRequest,
  } = params;
  const {
    appendTextMessage,
    appendAssistantDelta,
    removeEmptyAssistantTail,
    chatMessages,
  } = chat;
  const {
    pendingDraftStartResume,
    updatePendingDraftStartResume,
    isPendingDraftStartResume,
  } = pendingRequest;
  const draftRunId = draftState?.draft_run_id;
  const [chatInput, setChatInput] = useState("");
  const { startStream, stopStream } = useSSEStream({
    forceEventStream: true,
    onMessage: (content) => {
      appendAssistantDelta(content);
    },
    onToolResult: handleToolResult,
    onComplete: () => {
      removeEmptyAssistantTail();
      setActiveToolName(null);
      setLoadingAction(null);
    },
    onError: (error) => {
      removeEmptyAssistantTail();
      setActiveToolName(null);
      showError(
        translateMessage(t, error) || t("error-failed-to-send-message"),
      );
      setLoadingAction(null);
    },
  });
  const sendChatMessage = useCallback(
    async (
      rawContent: string,
      options: {
        confirmedBulkReviewChoices?: StationaryEnergyToolChoiceSummary[];
        confirmedRollbackReviewChoices?: StationaryEnergyToolChoiceSummary[];
        // Re-send an earlier request without showing it again in the chat.
        resumeAfterDraftStart?: boolean;
      } = {},
    ): Promise<void> => {
      const {
        confirmedBulkReviewChoices,
        confirmedRollbackReviewChoices,
        resumeAfterDraftStart = false,
      } = options;
      const content = rawContent.trim();
      if (!content || loadingAction === "chat") {
        return;
      }

      clearError();
      // Follow-up messages do not cancel an earlier request. Only its automatic
      // continuation or an explicit user action consumes the queue.
      if (resumeAfterDraftStart) {
        if (!isPendingDraftStartResume()) {
          return;
        }
        updatePendingDraftStartResume(null);
      }
      if (!resumeAfterDraftStart) {
        setChatInput("");
        appendTextMessage("user", content);
        lastUserChatContentRef.current = content;
      }

      appendTextMessage("assistant", "");
      setLoadingAction("chat");

      try {
        const nextThreadId = await ensureThreadId(true);
        await startStream("/api/v1/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildStationaryEnergyChatRequest({
              cityId,
              cityName,
              content,
              confirmedBulkReviewChoices: confirmedBulkReviewChoicePayload(
                confirmedBulkReviewChoices ?? [],
              ),
              confirmedRollbackReviewChoices:
                confirmedRollbackReviewChoicePayload(
                  confirmedRollbackReviewChoices ?? [],
                ),
              decisionReviewContext,
              draftState,
              focusedDecisionState,
              focusedProposalId: effectiveFocusedProposalId,
              inventoryId,
              inventoryYear,
              resumeAfterDraftStart,
              threadId: nextThreadId,
            }),
          ),
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          removeEmptyAssistantTail();
          showError(
            resolveErrorMessage(t, error, "error-failed-to-send-message"),
          );
        }
        setLoadingAction(null);
      }
    },
    [
      appendTextMessage,
      cityId,
      cityName,
      clearError,
      decisionReviewContext,
      focusedDecisionState,
      draftState,
      effectiveFocusedProposalId,
      ensureThreadId,
      inventoryId,
      inventoryYear,
      loadingAction,
      lastUserChatContentRef,
      setLoadingAction,
      removeEmptyAssistantTail,
      showError,
      startStream,
      t,
      updatePendingDraftStartResume,
      isPendingDraftStartResume,
    ],
  );

  const submitChat = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      await sendChatMessage(chatInput);
    },
    [chatInput, sendChatMessage],
  );

  // When the agent started a run for a request, re-send that request once the
  // run is ready and the start turn has finished streaming, so the agent
  // answers it with the new run data and review tools. The existing review
  // cards appear as usual when the run loads.
  const draftStatus = draftState?.status;
  // A run that failed or finished elsewhere has nothing left to resume.
  const awaitingDraftStartResume = Boolean(
    pendingDraftStartResume &&
    draftRunId === pendingDraftStartResume.draftRunId &&
    draftStatus &&
    !hasTerminalDraftStatus(draftStatus),
  );
  useEffect(() => {
    const pending = pendingDraftStartResume;
    if (
      !pending ||
      !awaitingDraftStartResume ||
      !draftStatus ||
      !canReviewDraftStatus(draftStatus) ||
      loadingAction === "chat"
    ) {
      return;
    }
    // Wait for any follow-up chat turn to finish. The ref also guards a cancel
    // action that happens before React cleans up this scheduled continuation.
    const timeout = window.setTimeout(() => {
      if (!isPendingDraftStartResume(pending)) {
        return;
      }
      void sendChatMessage(pending.content, { resumeAfterDraftStart: true });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [
    awaitingDraftStartResume,
    draftStatus,
    loadingAction,
    pendingDraftStartResume,
    isPendingDraftStartResume,
    sendChatMessage,
  ]);

  const lastChatMessage = chatMessages[chatMessages.length - 1];
  const chatActivityLabel = resolveChatActivityLabel(t, {
    activeToolName,
    awaitingDraftStartResume,
    isChatStreaming: loadingAction === "chat",
    replyTextVisible:
      lastChatMessage?.kind === "text" &&
      lastChatMessage.role === "assistant" &&
      lastChatMessage.text.trim().length > 0,
  });

  return {
    chatInput,
    setChatInput,
    sendChatMessage,
    submitChat,
    stopStream,
    chatActivityLabel,
  };
}
