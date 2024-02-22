"use client";

import ChatBot from "@/components/chat-bot";

export default function Chat({ params: { lng } }: { params: { lng: string } }) {
  return <ChatBot />;
}
