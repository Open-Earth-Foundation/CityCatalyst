"use client";
import { use } from "react";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useGetOrganizationQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { useEffect } from "react";
import {
  useOrganizationContext,
  hasOrganizationChanged,
  normalizeOrganizationState,
} from "@/hooks/organization-context-provider/use-organizational-context";
import { useTheme } from "next-themes";

export default function OrganizationSettingsLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar showMenu lng={lng} />
      <Toaster />
      <Box w="full" h="full">
        {props.children}
      </Box>
    </Box>
  );
}
