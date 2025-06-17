"use client";
import { use } from "react";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";

export default function OrganizationSettingsLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; inventory: string }>;
}) {
  const { lng, inventory } = use(props.params);

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar showMenu lng={lng} />
      <Toaster />
      <Box className="w-full h-full">{props.children}</Box>
      <ChatPopover inventoryId={inventory} />
    </Box>
  );
}
