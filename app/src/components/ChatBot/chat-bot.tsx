"use client";

import { Box, HStack, IconButton, Input } from "@chakra-ui/react";
import { useChat } from "ai/react";
import { BsPaperclip } from "react-icons/bs";
import { MdOutlineSend } from "react-icons/md";

export default function ChatBot({
  userName = "User",
  inputRef,
}: {
  userName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/v0/chat",
  });
  return (
    <div className="flex flex-col w-full stretch">
      <Box className="overflow-y-auto max-h-96">
      {messages.map((m) => (
        <div key={m.id} className="whitespace-pre-wrap">
          <span
            className={`font-bold ${m.role === "user" ? "text-green-500" : "text-blue-500"}`}
          >
            {m.role === "user" ? `${userName}: ` : "Climate Assistant: "}
          </span>
          {m.content}
        </div>
      ))}
      </Box>

      <form onSubmit={handleSubmit}>
        <HStack mt={4}>
          {/*<IconButton
            variant="ghost"
            icon={<BsPaperclip size={24} />}
            color="content-tertiary"
            aria-label="Attach file"
          />*/}
          <Input
            // className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
            ref={inputRef}
            className="flex-grow w-full"
            value={input}
            placeholder="Ask your climate assistant something..."
            onChange={handleInputChange}
          />
          <IconButton
            variant="ghost"
            icon={<MdOutlineSend size={24} />}
            color="content-tertiary"
            aria-label="Send message"
          />
        </HStack>
      </form>
    </div>
  );
}
