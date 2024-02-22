"use client";

import { useChat } from "ai/react";

export default function ChatBot() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/v0/chat",
  });
  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((m) => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === "user" ? "User: " : "Climate Assistant: "}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Ask your climate assistant something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
