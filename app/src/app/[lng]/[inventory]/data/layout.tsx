"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Box } from "@chakra-ui/react";

export default function DataLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode;
  params: { lng: string };
}) {
  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <div className="w-full h-full">{children}</div>
    </Box>
  );
}
