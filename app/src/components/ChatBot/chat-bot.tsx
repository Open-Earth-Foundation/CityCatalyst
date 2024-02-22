"use client";

import { Box, HStack, IconButton, Text, Textarea } from "@chakra-ui/react";
import { useChat } from "ai/react";
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
  const userStyles = "rounded-br-none bg-blue-500";
  const botStyles = "rounded-bl-none bg-white";
  return (
    <div className="flex flex-col w-full stretch">
      <div className="overflow-y-auto max-h-96 space-y-4">
        {messages.map((m) => (
          <Box
            key={m.id}
            className={`rounded-2xl border-r-t px-6 py-4 ${m.role === "user" ? userStyles : botStyles}`}
            bg={m.role === "user" ? "content.link" : "base.light"}
          >
            <Text
              className="whitespace-pre-wrap"
              color={m.role === "user" ? "base.light" : "content.tertiary"}
            >
              {m.content}
            </Text>
          </Box>
        ))}
      </div>

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
