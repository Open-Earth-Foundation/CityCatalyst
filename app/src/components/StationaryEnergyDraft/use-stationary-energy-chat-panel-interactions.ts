"use client";

import { COMPOSER_MAX_HEIGHT } from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type { ClimaChatPanelProps } from "@/components/StationaryEnergyDraft/stationary-energy-chat-panel-types";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef } from "react";

type InteractionParams = {
  actions: Pick<ClimaChatPanelProps["actions"], "setChatInput">;
  state: Pick<
    ClimaChatPanelProps["state"],
    | "chatInput"
    | "chatMessages"
    | "chatActivityLabel"
    | "loadingAction"
    | "showStaleWarning"
  >;
  t: TFunction;
};

export function useStationaryEnergyChatPanelInteractions({
  actions,
  state,
  t,
}: InteractionParams) {
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowChatRef = useRef(true);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousLoadingActionRef = useRef(state.loadingAction);
  const lastFocusedMessageIdRef = useRef<string | null>(null);
  const { chatInput } = state;
  const setChatInput = actions.setChatInput;
  const lastChatMessage = state.chatMessages[state.chatMessages.length - 1];
  const lastChatMessageText =
    lastChatMessage?.kind === "text" ? lastChatMessage.text : "";
  const lastChatMessageIsUser =
    lastChatMessage?.kind === "text" && lastChatMessage.role === "user";

  const handleChatScroll = useCallback(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) {
      return;
    }

    const distanceFromBottom =
      scrollRegion.scrollHeight -
      scrollRegion.scrollTop -
      scrollRegion.clientHeight;
    shouldFollowChatRef.current = distanceFromBottom < 140;
  }, []);

  const focusComposerInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = chatInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });
  }, []);

  // Resize only when the input changes, up to the height where it should scroll.
  useEffect(() => {
    const input = chatInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [chatInput]);

  const handleAskAboutProposal = useCallback(
    (label: string) => {
      const draftQuestion = t("chat-panel-ask-about-proposal", { label });
      if (draftQuestion && !chatInput.trim()) setChatInput(draftQuestion);
      focusComposerInput();
    },
    [chatInput, focusComposerInput, setChatInput, t],
  );

  // Auto-scroll honours reader intent: follow the live edge only while the
  // reader is already at the bottom, never pull them while they have scrolled
  // up or are selecting text, and re-pin when they send a message themselves.
  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) {
      return;
    }

    if (lastChatMessageIsUser) {
      shouldFollowChatRef.current = true;
    }

    if (!shouldFollowChatRef.current) {
      return;
    }

    const selection = window.getSelection();
    const isSelectingInChat = Boolean(
      selection &&
      !selection.isCollapsed &&
      selection.anchorNode &&
      scrollRegion.contains(selection.anchorNode),
    );
    if (isSelectingInChat) {
      return;
    }

    const scrollToBottom = () => {
      scrollRegion.scrollTo({
        top: scrollRegion.scrollHeight,
        behavior: state.loadingAction === "chat" ? "auto" : "smooth",
      });
    };

    const animationFrame = window.requestAnimationFrame(scrollToBottom);
    const timeout = window.setTimeout(scrollToBottom, 80);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [
    lastChatMessage?.id,
    lastChatMessage?.kind,
    lastChatMessageIsUser,
    lastChatMessageText,
    state.chatActivityLabel,
    state.chatMessages.length,
    state.loadingAction,
  ]);

  // Restore focus after a reply or new widget, using one transition tracker.
  useEffect(() => {
    const previousLoadingAction = previousLoadingActionRef.current;
    previousLoadingActionRef.current = state.loadingAction;
    const chatJustFinished =
      previousLoadingAction === "chat" && state.loadingAction !== "chat";
    if (chatJustFinished) focusComposerInput();
    if (state.showStaleWarning || state.loadingAction === "chat") return;
    const widgetPresented =
      lastChatMessage?.kind !== undefined &&
      lastChatMessage.kind !== "text" &&
      lastChatMessage.id !== lastFocusedMessageIdRef.current;
    if (widgetPresented) {
      lastFocusedMessageIdRef.current = lastChatMessage.id;
      if (!chatJustFinished) focusComposerInput();
    }
  }, [
    focusComposerInput,
    lastChatMessage?.id,
    lastChatMessage?.kind,
    state.loadingAction,
    state.showStaleWarning,
  ]);

  const pinToBottom = useCallback(() => {
    shouldFollowChatRef.current = true;
  }, []);
  return {
    scrollRegionRef,
    chatInputRef,
    handleChatScroll,
    handleAskAboutProposal,
    pinToBottom,
  };
}
