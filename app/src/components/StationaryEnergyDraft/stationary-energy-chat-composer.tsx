"use client";

import {
  COMPOSER_MAX_HEIGHT,
  FLOW_BUTTON_RADIUS,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type { ClimaChatPanelProps } from "@/components/StationaryEnergyDraft/stationary-energy-chat-panel-types";
import { Button } from "@/components/ui/button";
import { Box, HStack, Text, Textarea } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { RefObject } from "react";
import { MdSend } from "react-icons/md";

export function StationaryEnergyChatComposer({
  actions,
  state,
  t,
  chatInputRef,
  pinToBottom,
}: ClimaChatPanelProps & {
  t: TFunction;
  chatInputRef: RefObject<HTMLTextAreaElement | null>;
  pinToBottom: () => void;
}) {
  return (
    <Box
      data-testid="clima-chat-composer"
      px={{ base: 3, md: 6 }}
      py={3}
      bg="background.backgroundGreyFlat"
    >
      {state.pendingDraftStartRequest || state.draftStartResumeNotice ? (
        <Box role="status" maxW="900px" mx="auto" mb={3}>
          <Text color="content.secondary" fontSize="label.md">
            {state.pendingDraftStartRequest
              ? t("chat-pending-request-waiting", {
                  request: state.pendingDraftStartRequest,
                })
              : state.draftStartResumeNotice}
          </Text>
          {state.pendingDraftStartRequest ? (
            <Button
              variant="outline"
              size="sm"
              mt={2}
              onClick={actions.cancelDraftStartResume}
            >
              {t("chat-pending-request-cancel")}
            </Button>
          ) : null}
        </Box>
      ) : null}
      <form
        onSubmit={(event) => {
          pinToBottom();
          actions.submitChat(event);
        }}
        style={{ width: "100%", maxWidth: "900px", margin: "0 auto" }}
      >
        <HStack gap={2} align="flex-end">
          <Textarea
            ref={chatInputRef}
            value={state.chatInput}
            onChange={(event) => actions.setChatInput(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              state.pendingDecisionCount > 0
                ? t("chat-panel-placeholder-review")
                : t("chat-panel-placeholder-default")
            }
            rows={1}
            resize="none"
            minH="44px"
            maxH={`${COMPOSER_MAX_HEIGHT}px`}
            overflowY="auto"
            borderRadius="rounded"
            bg="background.backgroundGreyFlat"
            borderColor="border.overlay"
          />
          {state.loadingAction === "chat" ? (
            <Button
              variant="outline"
              borderRadius={FLOW_BUTTON_RADIUS}
              onClick={actions.stopChat}
            >
              {t("chat-panel-stop")}
            </Button>
          ) : (
            <Button type="submit" borderRadius={FLOW_BUTTON_RADIUS} px={4}>
              <MdSend />
            </Button>
          )}
        </HStack>
      </form>
    </Box>
  );
}
