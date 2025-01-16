"use client";

import {
  Icon,
  IconButton,
  PopoverHeader,
  useDisclosure,
} from "@chakra-ui/react";
import React from "react";
import { BsStars } from "react-icons/bs";
import ChatBot from "./chat-bot";
import { useTranslation } from "@/i18n/client";
import { AskAiIcon } from "../icons";

import {
  PopoverBody,
  PopoverCloseTrigger,
  PopoverContent,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Button } from "@/components/ui/button";

export default function ChatPopover({
  lng = "en",
  inventoryId,
}: {
  userName?: string;
  lng?: string;
  inventoryId: string;
}) {
  const { open, onOpen, onClose } = useDisclosure();
  const inputRef = React.useRef(null);
  const { t } = useTranslation(lng, "chat");

  return (
    <>
      <PopoverRoot
        open={open}
        initialFocusEl={() => inputRef.current}
        onOpenChange={onOpen}
        positioning={{
          placement: "top-end",
        }}
        // closeOnBlur={false}
        // strategy="fixed"
        // modifiers={[
        //   {
        //     name: "zIndex",
        //     enabled: true,
        //     phase: "write",
        //     fn: ({ state }) => {
        //       state.elements.popper.style.zIndex = "9999";
        //     },
        //   },
        // ]}
      >
        <PopoverTrigger asChild>
          <Button
            className="fixed z-30 bottom-16 right-16"
            fontSize="button.md"
            fontStyle="normal"
            fontWeight="600"
            letterSpacing="wider"
            py="26px"
            fontFamily="heading"
            aria-label={t("ai-expert")}
            variant="solid"
          >
            {/* <Icon as={AskAiIcon} h={24} w={24} /> */}
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
            <ChatBot inputRef={inputRef} t={t} inventoryId={inventoryId} />
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
