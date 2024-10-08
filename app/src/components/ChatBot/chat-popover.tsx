"use client";

import {
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  useDisclosure,
} from "@chakra-ui/react";
import React from "react";
import { BsStars } from "react-icons/bs";
import ChatBot from "./chat-bot";
import { useTranslation } from "@/i18n/client";

export default function ChatPopover({
  lng = "en",
  inventoryId,
}: {
  userName?: string;
  lng?: string;
  inventoryId: string;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const inputRef = React.useRef(null);
  const { t } = useTranslation(lng, "chat");

  return (
    <>
      <Popover
        isOpen={isOpen}
        initialFocusRef={inputRef}
        onOpen={onOpen}
        onClose={onClose}
        placement="top-end"
        closeOnBlur={false}
        strategy="fixed"
      >
        <PopoverTrigger>
          <IconButton
            p={4}
            icon={<BsStars />}
            className="fixed z-30 bottom-16 right-16"
            size="lg"
            aria-label={t("ai-expert")}
          />
        </PopoverTrigger>
        <PopoverContent
          p={0}
          w="57vw"
          h="72vh"
          bg="background.neutral"
          className="drop-shadow-md"
        >
          <PopoverHeader
            bg="background.overlay"
            textColor="content.alternative"
            fontWeight="600"
            fontSize="28px"
            fontFamily="heading"
            textTransform="capitalize"
            lineHeight="36px"
            borderTopRadius={4}
            p={6}
          >
            {t("ask-ai-expert")}
            <PopoverCloseButton
              color="content.secondary"
              w={8}
              h={8}
              mr={4}
              mt={6}
            />
          </PopoverHeader>
          <PopoverBody maxH={650} w="full" p={6} borderRadius={4}>
            <ChatBot inputRef={inputRef} t={t} inventoryId={inventoryId} />
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </>
  );
}
