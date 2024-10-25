"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";

export default function DataLayout({
  children,
  params: { lng, inventory },
}: {
  children: React.ReactNode;
  params: { lng: string; inventory: string };
}) {
  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar lng={lng} isPublic={true} />
      <div className="w-full h-full">{children}</div>
    </Box>
  );
}
