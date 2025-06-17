"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import {
  useGetOrganizationForInventoryQuery,
  useGetOrganizationQuery,
} from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { useEffect } from "react";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useTheme } from "next-themes";

export default function OrganizationSettingsLayout({
  children,
  params: { lng, id },
}: {
  children: React.ReactNode;
  params: { lng: string; id: string };
}) {
  const { data: orgData, isLoading: isOrgDataFetching } =
    useGetOrganizationQuery(id, {
      skip: !id,
    });

  const { setOrganization, organization } = useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (orgData) {
      const logoUrl = orgData?.logoUrl ?? null;
      const active = orgData?.active ?? true;

      if (
        organization?.logoUrl !== logoUrl ||
        organization?.active !== active
      ) {
        setOrganization({ logoUrl, active });
      }
      setTheme(orgData?.theme?.themeKey ?? ("blue_theme" as string));
    } else {
      setTheme("blue_theme");
    }
  }, [isOrgDataFetching, orgData, setOrganization, setTheme]);

  if (isOrgDataFetching) {
    return <ProgressLoader />;
  }

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar showMenu lng={lng} />
      <Toaster />
      <Box className="w-full h-full">{children}</Box>
    </Box>
  );
}
