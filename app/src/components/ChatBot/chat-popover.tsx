"use client";

import { Icon, PopoverHeader, useDisclosure } from "@chakra-ui/react";
import React, { useCallback, useEffect, useState } from "react";
import ChatBot, { type ChatBotProps } from "./chat-bot";
import ClimaAIAssistantDisclaimerDialog from "./clima-ai-assistant-disclaimer-dialog";
import { useTranslation } from "@/i18n/client";
import { AskAiIcon } from "../icons";

import {
  PopoverBody,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Button } from "@/components/ui/button";
import { OpenChangeDetails } from "@zag-js/popover";
import { api } from "@/services/api";
import { useAIButtonPosition } from "@/hooks/useAIButtonPosition";
import { usePathname } from "next/navigation";

export default function ChatPopover({
  lng,
  inventoryId,
}: {
  userName?: string;
  lng?: string;
  inventoryId?: string; // optional value to override the default inventory ID
}) {
  const { open, onOpen, onClose } = useDisclosure();
  const inputRef = React.useRef(null);
  const { t } = useTranslation(lng as string, "chat");

  // Disclaimer dialog state
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(false);

  // Context-specific suggestions injected by external components via custom event
  const [contextSuggestions, setContextSuggestions] =
    useState<ChatBotProps["contextSuggestions"]>(null);

  // get user info
  const { data: userInfo } = api.useGetUserInfoQuery();

  const effectiveInventoryId =
    inventoryId ?? userInfo?.defaultInventoryId ?? "";

  // Check if user has accepted disclaimer on mount
  useEffect(() => {
    const disclaimerAccepted = localStorage.getItem(
      "clima-ai-disclaimer-accepted",
    );
    setHasAcceptedDisclaimer(disclaimerAccepted === "true");
  }, []);

  const onOpenChange = useCallback(
    (e: OpenChangeDetails) => {
      if (!e.open) {
        onClose();
      } else {
        // Check if user needs to see disclaimer first
        if (!hasAcceptedDisclaimer) {
          setShowDisclaimer(true);
        } else {
          onOpen();
        }
      }
    },
    [hasAcceptedDisclaimer, onClose, onOpen],
  );

  const handleDisclaimerAccept = () => {
    localStorage.setItem("clima-ai-disclaimer-accepted", "true");
    setHasAcceptedDisclaimer(true);
    setShowDisclaimer(false);
    onOpen();
  };

  // Allow external components to open the popover via a custom event.
  // The event detail may include context-specific suggestions to replace the defaults.
  const handleOpenClimaAI = useCallback(
    (e: Event) => {
      const detail = (
        e as CustomEvent<{
          suggestions?: { preview: string; message: string }[];
        }>
      ).detail;
      setContextSuggestions(detail?.suggestions ?? null);
      onOpenChange({ open: true });
    },
    [onOpenChange],
  );

  useEffect(() => {
    window.addEventListener("open-clima-ai", handleOpenClimaAI);
    return () => window.removeEventListener("open-clima-ai", handleOpenClimaAI);
  }, [handleOpenClimaAI]);

  // Lock body scroll while popover is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Use the new hook to position the AI button
  const dynamicBottomPosition = useAIButtonPosition();

  const pathname = usePathname();
  const isStationaryEnergyAgenticRoute = pathname.includes(
    "/draft/stationary-energy",
  );

  // Hide the global launcher where Clima is embedded as the primary workflow.
  if (pathname.startsWith(`/${lng}/auth`) || isStationaryEnergyAgenticRoute) {
    return null;
  }

  return (
    <>
      <ClimaAIAssistantDisclaimerDialog
        t={t}
        open={showDisclaimer}
        onOpenChange={setShowDisclaimer}
        onAccept={handleDisclaimerAccept}
      />
      <PopoverRoot
        open={open}
        initialFocusEl={() => inputRef.current}
        onOpenChange={onOpenChange}
        positioning={{
          placement: "top-end",
          offset: { mainAxis: -50 },
        }}
      >
        <PopoverTrigger asChild>
          <Button
            position="fixed"
            zIndex={1300}
            right={6}
            transition="all 300ms"
            bottom={dynamicBottomPosition}
            fontSize="button.md"
            fontStyle="normal"
            fontWeight="600"
            letterSpacing="wider"
            py="26px"
            px="24px"
            bg="interactive.tertiary"
            w="fit-content"
            maxW="280px"
            whiteSpace="nowrap"
            fontFamily="heading"
            aria-label={t("ai-expert")}
            variant="solid"
            data-ai-button
          >
            <Icon as={AskAiIcon} h={24} w={24} />
            {t("ask-ai")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          p={0}
          w="533px"
          maxHeight={"76vh"}
          display="flex"
          flexDirection="column"
          overflow="hidden"
          bg="sentiment.backgroundOverlay"
          className="drop-shadow-md"
          pos="relative"
          zIndex={9999}
        >
          <PopoverHeader
            bg="interactive.tertiary"
            color="base.light"
            fontWeight="600"
            fontSize="28px"
            fontFamily="heading"
            textTransform="capitalize"
            lineHeight="36px"
            borderTopRadius={4}
            p={6}
          >
            {t("ask-clima")}
          </PopoverHeader>
          <PopoverBody
            w="full"
            p={6}
            borderRadius={4}
            flex="1"
            overflow="hidden"
            display="flex"
            flexDirection="column"
          >
            <ChatBot
              inputRef={inputRef}
              t={t}
              inventoryId={effectiveInventoryId}
              contextSuggestions={contextSuggestions}
            />
          </PopoverBody>
          <PopoverCloseTrigger color="base.light" boxSize={10} mr={4} mt={4} />
        </PopoverContent>
      </PopoverRoot>
    </>
  );
}
