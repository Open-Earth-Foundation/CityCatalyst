"use client";

import { Icon, PopoverHeader, useDisclosure } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import ChatBot from "./chat-bot";
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
import { useSession } from "next-auth/react";

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

  const { data: session } = useSession();

  // get user info
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  const effectiveInventoryId =
    inventoryId ?? userInfo?.defaultInventoryId ?? "";

  const onOpenChange = (e: OpenChangeDetails) => {
    if (!e.open) {
      onClose();
    } else {
      onOpen();
    }
  };

  // adjust the position of the popover based on the scroll position (i.e when the user scrolls to the bottom of the page)
  const [scrollPosition, setScrollPosition] = useState(0);

  // Get

  const handleScroll = () => {
    const scrollPosition = window.scrollY;
    setScrollPosition(scrollPosition);
  };

  const getDynamicBottomPosition = () => {
    const maxScroll =
      document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercentage = (scrollPosition / maxScroll) * 100;
    if (scrollPercentage > 90) {
      // Move up when near bottom
      return "105px";
    }
    // Default position
    return "8px";
  };

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
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
            zIndex={30}
            right={16}
            transition="all 300ms"
            bottom={getDynamicBottomPosition()}
            fontSize="button.md"
            fontStyle="normal"
            fontWeight="600"
            letterSpacing="wider"
            py="26px"
            maxW="220px"
            fontFamily="heading"
            aria-label={t("ai-expert")}
            variant="solid"
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
