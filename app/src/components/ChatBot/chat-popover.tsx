"use client";

import { Icon, PopoverHeader, useDisclosure } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import ChatBot from "./chat-bot";
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

  // get user info
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  const effectiveInventoryId =
    inventoryId ?? userInfo?.defaultInventoryId ?? "";

  // Check if user has accepted disclaimer on mount
  useEffect(() => {
    const disclaimerAccepted = localStorage.getItem(
      "clima-ai-disclaimer-accepted",
    );
    setHasAcceptedDisclaimer(disclaimerAccepted === "true");
  }, []);

  const onOpenChange = (e: OpenChangeDetails) => {
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
  };

  const handleDisclaimerAccept = () => {
    localStorage.setItem("clima-ai-disclaimer-accepted", "true");
    setHasAcceptedDisclaimer(true);
    setShowDisclaimer(false);
    onOpen();
  };

  const handleDisclaimerCancel = () => {
    setShowDisclaimer(false);
  };

  // Use the new hook to position the AI button
  const dynamicBottomPosition = useAIButtonPosition();

  const pathname = usePathname();

  // Hide the ChatPopover on auth pages
  if (pathname.startsWith(`/${lng}/auth`)) {
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
        }}
      >
        <PopoverTrigger asChild>
          <Button
            position="fixed"
            zIndex={9999}
            right={6}
            transition="all 300ms"
            bottom={dynamicBottomPosition}
            fontSize="button.md"
            fontStyle="normal"
            fontWeight="600"
            letterSpacing="wider"
            py="26px"
            maxW="220px"
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
          w="57vw"
          maxHeight={"76vh"}
          bg="background.neutral"
          className="drop-shadow-md"
          pos="relative"
          zIndex={9999}
        >
          <PopoverHeader
            bg="background.overlay"
            color="content.alternative"
            fontWeight="600"
            fontSize="28px"
            fontFamily="heading"
            textTransform="capitalize"
            lineHeight="36px"
            borderTopRadius={4}
            p={6}
          >
            {t("ask-ai-expert")}
          </PopoverHeader>
          <PopoverBody w="full" p={6} borderRadius={4}>
            <ChatBot
              inputRef={inputRef}
              t={t}
              inventoryId={effectiveInventoryId}
            />
          </PopoverBody>
          <PopoverCloseTrigger
            color="content.secondary"
            w={8}
            h={8}
            mr={4}
            mt={6}
          />
        </PopoverContent>
      </PopoverRoot>
    </>
  );
}
