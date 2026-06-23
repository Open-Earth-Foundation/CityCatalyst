"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useParams } from "next/navigation";
import { getParamValueRequired } from "@/util/helpers";

/** Layout for the remaining legacy inventory routes (stationary-energy draft redirect). */
export default function LegacyInventoryLayout(props: {
  children: React.ReactNode;
}) {
  const { children } = props;
  const params = useParams();

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar showMenu lng={getParamValueRequired(params.lng)} />
      <Toaster />
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
