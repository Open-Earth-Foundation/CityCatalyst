"use client";

import { Box } from "@chakra-ui/react";
import { Toaster } from "@/components/ui/toaster";

export default function DataLayout(props: { children: React.ReactNode }) {
  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <Toaster />
      <div className="w-full h-full">{props.children}</div>
    </Box>
  );
}
