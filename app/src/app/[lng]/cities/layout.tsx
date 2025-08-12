"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { api, useGetUserQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { use } from "react";
import { useTheme } from "next-themes";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function CitiesLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { children } = props;

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  const { organization, setOrganization } = useOrganizationContext();
  const { setTheme } = useTheme();

  // Set default theme for cities route
  useEffect(() => {
    setTheme("blue_theme");
  }, [setTheme]);

  if (isUserInfoLoading) {
    return <ProgressLoader />;
  }

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
        {children}
      </Box>
    </Box>
  );
}
