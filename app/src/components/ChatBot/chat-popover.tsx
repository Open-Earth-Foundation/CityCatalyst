"use client";

import {
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverTrigger,
  useDisclosure,
} from "@chakra-ui/react";
import React from "react";
import { BsStars } from "react-icons/bs";
import ChatBot from "./chat-bot";

export default function ChatPopover({
  userName = "User",
}: {
  userName?: string;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const inputRef = React.useRef(null);

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
            aria-label="Climate Assistant"
          />
        </PopoverTrigger>
        <PopoverContent p={5}>
          {/* <FocusLock returnFocus persistentFocus={false}> */}
          <PopoverArrow />
          <PopoverCloseButton />
          <PopoverBody>
            <ChatBot userName={userName} inputRef={inputRef} />
          </PopoverBody>
          {/* </FocusLock> */}
        </PopoverContent>
      </Popover>
    </>
  );
}
