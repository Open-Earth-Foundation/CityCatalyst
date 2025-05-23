"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";

export default function OrganizationSettingsLayout({
  children,
  params: { lng, inventory },
}: {
  children: React.ReactNode;
  params: { lng: string; inventory: string };
}) {
  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar showMenu lng={lng} />
      <Toaster />
      <Box className="w-full h-full">{children}</Box>
      <ChatPopover inventoryId={inventory} />
    </Box>
  );
}
