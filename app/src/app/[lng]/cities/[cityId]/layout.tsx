"use client";

import { Box } from "@chakra-ui/react";
import React from "react";

export default function CitiesLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { children } = props;

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
