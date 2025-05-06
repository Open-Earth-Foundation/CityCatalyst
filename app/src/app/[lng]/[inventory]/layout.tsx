"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { api, useGetOrganizationForInventoryQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { useEffect } from "react";
import { useLogo } from "@/hooks/logo-provider/use-logo-provider";
import { useTheme } from "next-themes";

export default function DataLayout({
  children,
  params: { lng, inventory },
}: {
  children: React.ReactNode;
  params: { lng: string; inventory: string };
}) {
  const { data: inventoryOrgData, isLoading: isInventoryOrgDataLoading } =
    useGetOrganizationForInventoryQuery(inventory, {
      skip: !inventory,
    });

  const { setLogoUrl } = useLogo();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (inventoryOrgData) {
      setLogoUrl(inventoryOrgData?.logoUrl as string);
      setTheme(inventoryOrgData?.theme?.themeKey ?? ("blue_theme" as string));
    }
  }, [isInventoryOrgDataLoading, inventoryOrgData]);

  if (isInventoryOrgDataLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar showMenu lng={lng} />
      <Toaster />
      <div className="w-full h-full">{children}</div>
      <ChatPopover inventoryId={inventory} />
    </Box>
  );
}
