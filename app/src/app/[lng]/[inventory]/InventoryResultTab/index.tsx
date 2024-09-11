"use client";

import { useTranslation } from "@/i18n/client";
import { InventoryProgressResponse, InventoryResponse } from "@/util/types";
import { Box, HStack } from "@chakra-ui/react";
import { TabHeader } from "@/app/[lng]/[inventory]/TabHeader";
import EmissionsWidget  from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsWidget";
import TopEmissionsWidget  from "@/app/[lng]/[inventory]/InventoryResultTab/TopEmissionsWidget";


export default function InventoryResultTab({
                                             lng,
                                             inventory,
                                             isUserInfoLoading,
                                             isInventoryProgressLoading,
                                             inventoryProgress
                                           }: {
  lng: string;
  inventory?: InventoryResponse;
  isUserInfoLoading?: boolean;
  isInventoryProgressLoading?: boolean;
  inventoryProgress?: InventoryProgressResponse;
}) {
  const { t } = useTranslation(lng, "dashboard");
  return (
    <>
      {inventory && (
        <Box className="flex flex-col gap-[8px] w-full">
          <TabHeader
            t={t}
            year={inventory?.year}
            title={"tab-emission-inventory-results-title"}
          />
          <HStack my={4} alignItems={"start"}>
            <EmissionsWidget t={t} inventory={inventory} />
            <TopEmissionsWidget t={t} inventory={inventory} />
          </HStack>
        </Box>
      )}
    </>
  );
}
