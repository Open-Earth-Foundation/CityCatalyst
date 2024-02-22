"use client";

import ChatBot from "@/components/chat-bot";
import { useSession } from "next-auth/react";

export default function Chat({ params: { lng } }: { params: { lng: string } }) {
  const { data: session, status } = useSession();
  const userName = (status === "authenticated" ? session.user?.name : undefined) ?? "User";
  return <ChatBot userName={userName} />;
}
