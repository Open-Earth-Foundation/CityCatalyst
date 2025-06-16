"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useGetOrganizationForInventoryQuery } from "@/services/api";
import { useLogo } from "@/hooks/logo-provider/use-logo-provider";
import { useTheme } from "next-themes";
import { useEffect, use } from "react";
import ProgressLoader from "@/components/ProgressLoader";

export default function DataLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; inventory: string }>;
}) {
  const { lng, inventory } = use(props.params);

  const { data: inventoryOrgData, isLoading: isInventoryOrgDataLoading } =
    useGetOrganizationForInventoryQuery(inventory, {
      skip: !inventory,
    });

  const { setLogoUrl } = useLogo();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (inventoryOrgData) {
      setLogoUrl(inventoryOrgData?.logoUrl as string);
      setTheme(inventoryOrgData?.theme?.themeKey as string);
    }
  }, [isInventoryOrgDataLoading, inventoryOrgData]);

  if (isInventoryOrgDataLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar lng={lng} isPublic={true} />
      <Toaster />
      <div className="w-full h-full">{props.children}</div>
    </Box>
  );
}
