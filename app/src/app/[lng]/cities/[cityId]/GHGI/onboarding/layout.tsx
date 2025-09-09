"use client";
import { use } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";

export default function GHGIOnboardingLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; cityId: string }>;
}) {
  return (
    <Box
      as="main"
      bg="background.backgroundLight"
      h="full"
      display="flex"
      flexDirection="column"
    >
      <Toaster />
      <Box w="full" h="full" bg="no-repeat" px={8}>
        {props.children}
      </Box>
    </Box>
  );
} 