"use client";

import {
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  IconButton,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useChat } from "ai/react";
import { TFunction } from "i18next";
import { useRef } from "react";
import { ChangeEvent } from "react";
import { BsStars } from "react-icons/bs";
import { MdOutlineSend } from "react-icons/md";

export default function ChatBot({
  inputRef,
  t,
}: {
  userName?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  t: TFunction;
}) {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    append,
  } = useChat({
    api: "/api/v0/chat",
    initialMessages: [
      { id: "-1", content: t("initial-message"), role: "assistant" },
    ],
  });
  const formRef = useRef<HTMLFormElement>(null);

  const userStyles = "rounded-br-none align-end";
  const botStyles = "rounded-bl-none";
  const suggestions = [
    {
      preview: "What is GPC?",
      message: "What is the GHG Protocol for Cities?",
    },
    { preview: "How can I collect data?", message: "How can I add new data sources to CityCatalyst?" },
    { preview: "What is IPCC?", message: "What is the Intergovernmental Panel on Climate Change?" },
  ];

  return (
    <div className="flex flex-col w-full stretch">
      <div className="overflow-y-auto max-h-96 space-y-4">
        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <HStack key={m.id} align="top">
              <Box
                w={9}
                h={9}
                p={2}
                borderRadius="full"
                bg="content.alternative"
              >
                <Icon as={BsStars} boxSize={5} color="base.light" />
              </Box>
              <Box
                className={`rounded-2xl border-r-t px-6 py-4 ${isUser ? userStyles : botStyles}`}
                bg={isUser ? "content.link" : "base.light"}
              >
                <Text
                  className="whitespace-pre-wrap"
                  color={isUser ? "base.light" : "content.tertiary"}
                >
                  {m.content}
                </Text>
              </Box>
            </HStack>
          );
        })}
      </div>

      <Divider my={6} borderColor="border.neutral" />

      <div className="overflow-x-auto space-x-2 whitespace-nowrap pb-3">
        {suggestions.map((suggestion, i) => (
          <Button
            key={i}
            onClick={() => {
              append({
                content: suggestion.message,
                role: "user",
              });
              // handleInputChange({
              //   target: { value: suggestion },
              // } as any as ChangeEvent<HTMLTextAreaElement>);
              // formRef.current?.dispatchEvent(new Event("submit"));
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
          >
            {suggestion.preview}
          </Button>
        ))}
      </div>

      <form onSubmit={handleSubmit} ref={formRef}>
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
          />
          <IconButton
            type="submit"
            variant="ghost"
            icon={<MdOutlineSend size={24} />}
            color="content.tertiary"
            aria-label="Send message"
          />
        </HStack>
      </form>
    </div>
  );
}
