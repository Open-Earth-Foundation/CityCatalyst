"use client";

import { useTranslation } from "@/i18n/client";
import {
  InventoryProgressResponse,
  InventoryResponse,
  SectorProgress,
} from "@/util/types";
import { Box } from "@chakra-ui/react";
import { TabHeader } from "@/app/[lng]/[inventory]/TabHeader";

export default function InventoryResultTab({
  lng,
  inventory,
  isUserInfoLoading,
  isInventoryProgressLoading,
  inventoryProgress,
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
        <>
          <Box className="h-full" bg="background.backgroundLight" px={8}>
            <Box className="flex mx-auto max-w-full w-[1090px]">
              <Box className="flex flex-col gap-[8px] w-full h-300">
                <TabHeader
                  t={t}
                  year={inventory?.year}
                  title={"tab-emission-inventory-results-title"}
                />
              </Box>
            </Box>
          </Box>
        </>
      )}
    </>
  );
}
