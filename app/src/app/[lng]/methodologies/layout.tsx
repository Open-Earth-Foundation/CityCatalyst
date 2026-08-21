"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import React, { use } from "react";

export default function MethodologiesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(params);
  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar lng={lng} />
      <Toaster />
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
