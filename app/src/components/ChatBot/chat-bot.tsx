"use client";

import { Box, HStack, IconButton, Text, Input, Textarea } from "@chakra-ui/react";
import { useChat } from "ai/react";
import { BsPaperclip } from "react-icons/bs";
import { MdOutlineSend } from "react-icons/md";

export default function ChatBot({
  inputRef,
}: {
  userName?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/v0/chat",
  });
  return (
    <div className="flex flex-col w-full stretch">
      <Box className="overflow-y-auto max-h-96">
      {messages.map((m) => (
        <div key={m.id} className="whitespace-pre-wrap">
          <Text>
          {m.content}
          </Text>
        </div>
      ))}
      </Box>

      <hr className="my-6" />

      <form onSubmit={handleSubmit}>
        <HStack mt={4}>
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
            placeholder="Ask your climate assistant something..."
            onChange={handleInputChange}
          />
          <IconButton
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
