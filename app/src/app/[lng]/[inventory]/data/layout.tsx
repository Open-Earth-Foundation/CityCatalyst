"use client";

import { Box } from "@chakra-ui/react";
import { Toaster } from "@/components/ui/toaster";

export default function DataLayout(props: { children: React.ReactNode }) {
  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Toaster />
      <Box w="full" h="full">
        {props.children}
      </Box>
    </Box>
  );
}
