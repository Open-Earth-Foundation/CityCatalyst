"use client";

import { useChat } from "ai/react";

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
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
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

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          ref={inputRef}
          value={input}
          placeholder="Ask your climate assistant something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
