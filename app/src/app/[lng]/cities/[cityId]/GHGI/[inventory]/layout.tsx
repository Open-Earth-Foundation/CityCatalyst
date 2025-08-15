"use client";

import ChatPopover from "@/components/ChatBot/chat-popover";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { api, useGetOrganizationForInventoryQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { useEffect, use } from "react";
import { useTheme } from "next-themes";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

export default function InventoryLayout(props: {
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

  const { organization, setOrganization } = useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (inventoryOrgData) {
      const logoUrl = inventoryOrgData?.logoUrl ?? null;
      const active = inventoryOrgData?.active ?? true;

      if (organization.logoUrl !== logoUrl || organization.active !== active) {
        setOrganization({ logoUrl, active });
      }
      setTheme(inventoryOrgData?.theme?.themeKey ?? ("blue_theme" as string));
    } else {
      setTheme("blue_theme");
    }
  }, [isInventoryOrgDataLoading, inventoryOrgData, setOrganization, setTheme]);

  if (isInventoryOrgDataLoading || isUserInfoLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <Toaster />
      <Box w="full" h="full">
        {children}
      </Box>
      <ChatPopover inventoryId={inventory} />
    </Box>
  );
}
