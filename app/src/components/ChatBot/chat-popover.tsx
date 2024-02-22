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
}: {
  userName?: string;
  lng?: string;
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
        <PopoverContent p={2} w={533} bg="content/tertiary">
          <PopoverHeader fontWeight="semibold">{t("ask-ai-expert")}</PopoverHeader>
          {/* <FocusLock returnFocus persistentFocus={false}> */}
          <PopoverArrow />
          <PopoverCloseButton />
          <PopoverBody maxH={500} w="full">
            <ChatBot inputRef={inputRef} />
          </PopoverBody>
          {/* </FocusLock> */}
        </PopoverContent>
      </Popover>
    </>
  );
}
