"use client";

import { useState } from "react";

import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import {
  LuCheck,
  LuChevronDown,
  LuHistory,
  LuMessageSquare,
  LuPlus,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import {
  MenuContent,
  MenuItem,
  MenuItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { toaster } from "@/components/ui/toaster";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { isFetchBaseQueryError } from "@/util/helpers";
import type { ConceptNoteChatThread } from "@/util/types";

const NEW_CHAT_VALUE = "new-chat";

interface UseConceptNoteChatThreadsOptions {
  cityId: string;
  lng: string;
  runId: string;
  threadId: string | null;
}

export interface ConceptNoteChatThreadsController {
  /** Attached chats, newest first. */
  threads: ConceptNoteChatThread[];
  /** 1-based position of the active chat counted from the oldest, if known. */
  activeNumber: number | null;
  /** The newest attached chat is not the active one. */
  viewingOlderChat: boolean;
  busy: boolean;
  /** Reload counts and previews, which change as messages are sent. */
  refresh: () => void;
  startChat: () => Promise<void>;
  activateThread: (threadId: string) => Promise<void>;
}

export function useConceptNoteChatThreads({
  cityId,
  lng,
  runId,
  threadId,
}: UseConceptNoteChatThreadsOptions): ConceptNoteChatThreadsController {
  const { t } = useTranslation(lng, "concept-notes");
  const { data, refetch } = api.useGetConceptNoteChatThreadsQuery({
    cityId,
    runId,
  });
  const [startChatMutation, startState] = api.useStartConceptNoteChatMutation();
  const [activateMutation, activateState] =
    api.useActivateConceptNoteChatThreadMutation();
  const threads = data?.threads ?? [];
  const activeIndex = threads.findIndex(
    (thread) => thread.thread_id === threadId,
  );

  function reportFailure(
    error: unknown,
    conflictKey: string,
    errorKey: string,
  ) {
    toaster.create({
      title: t(
        isFetchBaseQueryError(error) && error.status === 409
          ? conflictKey
          : errorKey,
      ),
      type: "error",
    });
  }

  async function startChat(): Promise<void> {
    try {
      await startChatMutation({ cityId, runId }).unwrap();
      toaster.create({ title: t("start-new-chat-success"), type: "success" });
    } catch (error) {
      reportFailure(error, "start-new-chat-conflict", "start-new-chat-error");
    }
  }

  async function activateThread(nextThreadId: string): Promise<void> {
    if (nextThreadId === threadId) {
      return;
    }
    try {
      await activateMutation({
        cityId,
        runId,
        threadId: nextThreadId,
      }).unwrap();
    } catch (error) {
      reportFailure(error, "switch-chat-conflict", "switch-chat-error");
    }
  }

  return {
    threads,
    activeNumber: activeIndex === -1 ? null : threads.length - activeIndex,
    viewingOlderChat: activeIndex > 0,
    busy: startState.isLoading || activateState.isLoading,
    refresh: () => void refetch(),
    startChat,
    activateThread,
  };
}

interface ChatThreadSwitcherProps {
  controller: ConceptNoteChatThreadsController;
  disabled?: boolean;
  lng: string;
  threadId: string | null;
}

/** Header control: shows the active chat and lets the user open or revisit chats. */
export function ChatThreadSwitcher({
  controller,
  disabled = false,
  lng,
  threadId,
}: ChatThreadSwitcherProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [open, setOpen] = useState(false);
  const { threads, activeNumber, busy, refresh, startChat, activateThread } =
    controller;
  const formatDate = new Intl.DateTimeFormat(lng, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <MenuRoot
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) refresh();
      }}
      positioning={{ placement: "bottom-end" }}
      onSelect={({ value }) => {
        void (value === NEW_CHAT_VALUE ? startChat() : activateThread(value));
      }}
    >
      <MenuTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          px={2.5}
          gap={1.5}
          borderColor="border.neutral"
          color="content.secondary"
          bg={open ? "background.neutral" : "base.light"}
          fontSize="label.sm"
          fontWeight="semibold"
          textTransform="none"
          letterSpacing="normal"
          aria-label={t("chat-switcher-label")}
          data-testid="concept-note-chat-switcher"
          disabled={disabled}
          loading={busy}
        >
          <Icon as={LuMessageSquare} boxSize={3.5} />
          {activeNumber
            ? t("chat-number", { number: activeNumber })
            : t("chat-switcher-label")}
          <Icon as={LuChevronDown} boxSize={3.5} />
        </Button>
      </MenuTrigger>
      <MenuContent minW="300px" maxW="360px" borderRadius="rounded">
        <MenuItem
          value={NEW_CHAT_VALUE}
          gap={2.5}
          color="content.link"
          fontWeight="semibold"
          data-testid="concept-note-start-new-chat"
        >
          <Icon as={LuPlus} />
          {t("new-chat")}
        </MenuItem>
        {threads.length > 0 && (
          <>
            <MenuSeparator />
            <MenuItemGroup title={t("previous-chats")}>
              {threads.map((thread, index) => {
                const active = thread.thread_id === threadId;
                return (
                  <MenuItem
                    key={thread.thread_id}
                    value={thread.thread_id}
                    gap={2.5}
                    alignItems="center"
                    bg={active ? "background.neutral" : undefined}
                    data-testid="concept-note-chat-thread"
                    data-active={active ? "true" : undefined}
                  >
                    <Box flex={1} minW={0}>
                      <Text
                        fontSize="label.sm"
                        fontWeight="semibold"
                        color="content.primary"
                        truncate
                      >
                        {t("chat-number", { number: threads.length - index })}
                        {" · "}
                        {formatDate.format(Date.parse(thread.created_at))}
                      </Text>
                      <Text
                        fontSize="label.sm"
                        color="content.tertiary"
                        truncate
                      >
                        {thread.preview ?? t("chat-no-messages")}
                      </Text>
                    </Box>
                    <Text
                      fontSize="label.sm"
                      color="content.tertiary"
                      flexShrink={0}
                    >
                      {t("chat-message-count", { count: thread.message_count })}
                    </Text>
                    {active && (
                      <Icon
                        as={LuCheck}
                        color="sentiment.positiveDefault"
                        flexShrink={0}
                      />
                    )}
                  </MenuItem>
                );
              })}
            </MenuItemGroup>
          </>
        )}
      </MenuContent>
    </MenuRoot>
  );
}

interface OlderChatNoticeProps {
  controller: ConceptNoteChatThreadsController;
  lng: string;
}

/** Shown above the messages while an earlier chat is active. */
export function OlderChatNotice({ controller, lng }: OlderChatNoticeProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const { threads, viewingOlderChat, busy, activateThread } = controller;
  if (!viewingOlderChat) {
    return null;
  }
  // Compact, stacked layout: the chat column is too narrow for a side button.
  return (
    <Flex
      role="status"
      align="start"
      gap={3}
      border="1px solid"
      borderColor="content.link"
      borderRadius="rounded"
      bg="background.neutral"
      px={4}
      py={3}
      data-testid="concept-note-older-chat"
    >
      <Icon as={LuHistory} mt={0.5} flexShrink={0} color="content.link" />
      <Box minW={0}>
        <Text
          fontFamily="heading"
          fontSize="body.sm"
          fontWeight="semibold"
          color="content.primary"
        >
          {t("older-chat-notice-title")}
        </Text>
        <Text
          mt={0.5}
          fontSize="label.sm"
          lineHeight="20px"
          color="content.secondary"
        >
          {t("older-chat-notice")}
        </Text>
        <Button
          mt={2}
          size="xs"
          variant="outline"
          textTransform="none"
          letterSpacing="normal"
          loading={busy}
          onClick={() => void activateThread(threads[0].thread_id)}
          data-testid="concept-note-back-to-latest-chat"
        >
          {t("back-to-latest-chat")}
        </Button>
      </Box>
    </Flex>
  );
}
