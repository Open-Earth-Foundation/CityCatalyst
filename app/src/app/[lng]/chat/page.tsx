"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";

export default function Chat({ params: { lng } }: { params: { lng: string } }) {
  return <ChatPopover />;
}
