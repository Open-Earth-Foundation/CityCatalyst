"use client";

import { Box } from "@chakra-ui/react";
import { Toaster } from "@/components/ui/toaster";

export default function DataLayout({
  children,
  params: { lng },
}: {
  children: React.ReactNode;
  params: { lng: string };
}) {
  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <Toaster />
      <div className="w-full h-full">{children}</div>
    </Box>
  );
}
