"use client";

import React, { useEffect, useState } from 'react';
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  IconButton,
  Spacer,
  Text,
  Textarea,
} from "@chakra-ui/react";
// import { useChat } from "ai/react";
import { useAssistant } from 'ai/react'
import { TFunction } from "i18next";
import { BsStars } from "react-icons/bs";
import {
  MdCheckCircle,
  MdContentCopy,
  MdOutlineSend,
  MdOutlineThumbDown,
  MdOutlineThumbUp,
  MdRefresh,
} from "react-icons/md";
import { ScrollAnchor } from "./scroll-anchor";
import { RefObject, useRef } from "react";

function useEnterSubmit(): {
  formRef: RefObject<HTMLFormElement>;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
} {
  const formRef = useRef<HTMLFormElement>(null);
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      formRef.current?.requestSubmit();
      event.preventDefault();
    }
  };

  return { formRef, onKeyDown: handleKeyDown };
}

export default function ChatBot({
  inputRef,
  t,
  inventoryId,
}: {
  userName?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  t: TFunction;
  inventoryId: string;
}) {

  const [threadId, setthreadId] = useState("");

  // Creating the thread id for the given inventory on initial render
  // Passing the initial message to api to be set in thread
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/v0/assistants/threads/${inventoryId}`, { 
          method: "POST", 
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: t("initial-message")
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setthreadId(data.threadId)
      } catch (error) {
        console.error('API Call Failed:', error);
        // Handle error here
      }
    };

    fetchData();
  }, []); // Empty dependency array means this effect runs only once, 
  // HOWEVER currently it always runs twiche

  const {
    status,
    input,
    messages,
    submitMessage,
    setMessages,
    handleInputChange,
    append,
  } = useAssistant({
    api: `/api/v0/assistants/threads/messages`,
    threadId: threadId,
  })

  // Setting the initial message to display for the user
  // This message will not be passed to the assistant api
  // It will be set additionally when creating the threadId
  // to pass to the assistant api
  useEffect(() => {
    setMessages([{
      id: "-1",
      role: "assistant",
      content: t("initial-message"),
    }])
  }, [])

  const { copyToClipboard, isCopied } = useCopyToClipboard({});
  const { formRef, onKeyDown } = useEnterSubmit();
  const messagesWrapperRef = useRef<HTMLDivElement>(null);

  const userStyles = "rounded-br-none";
  const botStyles = "rounded-bl-none";
  const suggestions = [
    {
      preview: "What is GPC?",
      message: "What is the GHG Protocol for Cities?",
    },
    {
      preview: "How can I collect data?",
      message: "How can I add new data sources to CityCatalyst?",
    },
    {
      preview: "What is IPCC?",
      message: "What is the Intergovernmental Panel on Climate Change?",
    },
  ];

  return (
    <div className="flex flex-col w-full stretch">
      <div
        className="overflow-y-auto max-h-96 space-y-4"
        ref={messagesWrapperRef}
      >
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <HStack key={m.id} align="top">
              <Box
                w={9}
                h={9}
                p={2}
                borderRadius="full"
                bg="content.alternative"
                visibility={isUser ? "hidden" : "visible"}
              >
                <Icon as={BsStars} boxSize={5} color="base.light" />
              </Box>
              <Spacer />
              <Box
                className={`rounded-2xl border-r-t px-6 py-4 ${isUser ? userStyles : botStyles}`}
                bg={isUser ? "content.link" : "base.light"}
              >
                <Text
                  className="whitespace-pre-wrap"
                  color={isUser ? "base.light" : "content.tertiary"}
                  letterSpacing="0.5px"
                  lineHeight="24px"
                  fontSize="16px"
                >
                  {m.content}
                </Text>
                {!isUser &&
                  i === messages.length - 1 &&
                  messages.length > 1 && (
                    <>
                      <Divider borderColor="border.overlay" my={3} />
                      <HStack>
                        {/* <IconButton
                          variant="ghost"
                          icon={<Icon as={MdOutlineThumbUp} boxSize={5} />}
                          aria-label="Vote good"
                          color="content.tertiary"
                        />
                        <IconButton
                          variant="ghost"
                          icon={<Icon as={MdOutlineThumbDown} boxSize={5} />}
                          aria-label="Vote bad"
                          color="content.tertiary"
                        /> */}
                        <IconButton
                          onClick={() => copyToClipboard(m.content)}
                          variant="ghost"
                          icon={
                            <Icon
                              as={isCopied ? MdCheckCircle : MdContentCopy}
                              boxSize={5}
                            />
                          }
                          aria-label="Copy text"
                          color={
                            isCopied
                              ? "sentiment.positiveDefault"
                              : "content.tertiary"
                          }
                        />
                        <Spacer />
                        {/* <Button
                          onClick={() => reload()}
                          leftIcon={<Icon as={MdRefresh} boxSize={5} />}
                          variant="outline"
                          textTransform="none"
                          fontFamily="body"
                          color="content.tertiary"
                          borderColor="border.neutral"
                          fontWeight="400"
                          lineHeight="16px"
                          letterSpacing="0.5px"
                        >
                          {t("regenerate")}
                        </Button> */}
                      </HStack>
                    </>
                  )}
              </Box>
            </HStack>
          );
        })}
        <ScrollAnchor
          trackVisibility={status==="in_progress"}
          rootRef={messagesWrapperRef}
        />
      </div>

      <Divider mt={2} mb={6} borderColor="border.neutral" />

      <div className="overflow-x-auto space-x-2 whitespace-nowrap pb-3">
        {suggestions.map((suggestion, i) => (
          <Button
            key={i}
            onClick={() => {
              append({
                content: suggestion.message,
                role: "user",
              });
            }}
            bg="background.overlay"
            color="content.alternative"
            py={2}
            px={4}
            textTransform="none"
            fontSize="16px"
            fontFamily="body"
            letterSpacing="0.5px"
            lineHeight="24px"
            fontWeight="400"
            whiteSpace="nowrap"
            display="inline-block"
            isDisabled={status==="in_progress"}
          >
            {suggestion.preview}
          </Button>
        ))}
      </div>

      <form onSubmit={submitMessage} ref={formRef}>
        <HStack mt={1}>
          {/*<IconButton
            variant="ghost"
            icon={<BsPaperclip size={24} />}
            color="content.tertiary"
            aria-label="Attach file"
          />*/}
          <Textarea
            h="80px"
            ref={inputRef}
            className="flex-grow w-full p-4"
            value={input}
            placeholder={t("ask-assistant")}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
          />
          <IconButton
            type="submit"
            variant="ghost"
            icon={<MdOutlineSend size={24} />}
            color="content.tertiary"
            aria-label="Send message"
            disabled={true}
            isDisabled={status==="in_progress"}
          />
        </HStack>
      </form>
    </div>
  );
}
