"use client";

import { Box, HStack, Icon, Text } from "@chakra-ui/react";
import { LuFileText, LuLandmark, LuListTodo } from "react-icons/lu";

import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import type { DocumentWorkspace } from "@/util/document-workspace";

export type ChatWelcomeStage =
  "choose-funding" | "gather-points" | "ready-to-draft" | "drafted";

export function getChatWelcomeStage({
  draftHasContent,
  canStartDrafting,
  workspace,
}: {
  draftHasContent: boolean;
  canStartDrafting: boolean;
  workspace?: DocumentWorkspace;
}): ChatWelcomeStage {
  if (draftHasContent) return "drafted";
  if (
    workspace?.setup?.ready &&
    workspace.points.some(
      (point) =>
        point.status === "conflict" ||
        (point.required &&
          !["answered", "assumption", "not_applicable"].includes(point.status)),
    )
  )
    return "gather-points";
  return canStartDrafting ? "ready-to-draft" : "choose-funding";
}

interface ChatWelcomeProps {
  lng: string;
  stage: ChatWelcomeStage;
  onOpenDraft?: () => void;
  onOpenFundingSetup?: () => void;
  onOpenTodos?: () => void;
}

/**
 * Client-side greeting for an empty thread so the chat rail never opens
 * blank. It states what Clima will do and the single next step for the
 * current setup state.
 */
export function ChatWelcome({
  lng,
  stage,
  onOpenDraft,
  onOpenFundingSetup,
  onOpenTodos,
}: ChatWelcomeProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const action =
    stage === "choose-funding" && onOpenFundingSetup
      ? {
          label: t("drafting-setup-choose-funding"),
          icon: LuLandmark,
          onClick: onOpenFundingSetup,
        }
      : stage === "gather-points" && onOpenTodos
        ? {
            label: t("chat-welcome-open-todos"),
            icon: LuListTodo,
            onClick: onOpenTodos,
          }
        : stage === "ready-to-draft" && onOpenDraft
          ? {
              label: t("chat-welcome-open-draft"),
              icon: LuFileText,
              onClick: onOpenDraft,
            }
          : null;

  return (
    <Box
      alignSelf="start"
      minW={0}
      maxW="92%"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      px={3}
      py={2.5}
      data-testid="concept-note-chat-welcome"
      data-stage={stage}
    >
      <Text fontSize="body.sm" lineHeight="22px" color="content.primary">
        {t(
          stage === "gather-points"
            ? "chat-welcome-info-first-intro"
            : "chat-welcome-intro",
        )}
      </Text>
      <Text
        mt={2}
        fontSize="body.sm"
        lineHeight="22px"
        color="content.secondary"
      >
        {t(`chat-welcome-${stage}`)}
      </Text>
      {action && (
        <HStack mt={3} minW={0} maxW="full">
          <Button
            size="sm"
            variant="outline"
            maxW="full"
            minW={0}
            height="auto"
            minH="36px"
            py={2}
            whiteSpace="normal"
            onClick={action.onClick}
          >
            <Icon as={action.icon} flexShrink={0} />
            <Text
              as="span"
              minW={0}
              whiteSpace="normal"
              overflowWrap="anywhere"
              lineHeight="18px"
            >
              {action.label}
            </Text>
          </Button>
        </HStack>
      )}
    </Box>
  );
}
