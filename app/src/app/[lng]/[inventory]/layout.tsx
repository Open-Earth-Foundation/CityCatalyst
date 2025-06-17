"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import {
  api,
  useGetOrganizationForInventoryQuery,
  useGetUserQuery,
} from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { useEffect, use } from "react";
import { useLogo } from "@/hooks/logo-provider/use-logo-provider";
import { useTheme } from "next-themes";

export default function DataLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; inventory: string }>;
}) {
  const { lng, inventory } = use(props.params);
  const { children } = props;

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  let inventoryId: string | null;
  if (inventory && inventory !== "null") {
    inventoryId = inventory;
  } else {
    inventoryId = userInfo?.defaultInventoryId ?? null;
  }

  const { data: inventoryOrgData, isLoading: isInventoryOrgDataLoading } =
    useGetOrganizationForInventoryQuery(inventoryId!, {
      skip: !inventoryId,
    });

  const { setLogoUrl } = useLogo();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (inventoryOrgData) {
      setLogoUrl(inventoryOrgData?.logoUrl as string);
      setTheme(inventoryOrgData?.theme?.themeKey ?? ("blue_theme" as string));
    } else {
      setTheme("blue_theme");
    }
  }, [isInventoryOrgDataLoading, inventoryOrgData]);

  if (isInventoryOrgDataLoading || isUserInfoLoading) {
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
