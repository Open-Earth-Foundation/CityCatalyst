"use client";

import { Box, HStack, Icon, Text } from "@chakra-ui/react";
import { LuFileText, LuLandmark } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

export type ChatWelcomeStage = "choose-funding" | "ready-to-draft" | "drafted";

interface ChatWelcomeProps {
  lng: string;
  stage: ChatWelcomeStage;
  onOpenDraft?: () => void;
  onOpenFundingSetup?: () => void;
}

/**
 * Client-side greeting for an empty thread so the chat rail never opens
 * blank. It states what Clima will do and the single next step for the
 * current setup state. Model-proposed questions (chat suggestions) live
 * above the composer and are intentionally not duplicated here.
 */
export function ChatWelcome({
  lng,
  stage,
  onOpenDraft,
  onOpenFundingSetup,
}: ChatWelcomeProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const action =
    stage === "choose-funding" && onOpenFundingSetup
      ? {
          label: t("drafting-setup-choose-funding"),
          icon: LuLandmark,
          onClick: onOpenFundingSetup,
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
        {t("chat-welcome-intro")}
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
        <HStack mt={3}>
          <Button size="sm" variant="outline" onClick={action.onClick}>
            <Icon as={action.icon} />
            {action.label}
          </Button>
        </HStack>
      )}
    </Box>
  );
}
