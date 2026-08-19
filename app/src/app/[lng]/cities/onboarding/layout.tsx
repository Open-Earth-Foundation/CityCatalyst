"use client";
import { Suspense } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";

export default function OnboardingLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
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
        <Suspense fallback={null}>{props.children}</Suspense>
      </Box>
    </Box>
  );
}
