"use client";

import { Box } from "@chakra-ui/react";
import React from "react";
import Heading from "./Heading";
import { useTranslation } from "@/i18n/client";
import NotationsDefinitionAccordion from "./NotationsDefinitionAccordion";
import SectorTabs from "./SectorTabs";
import { api } from "@/services/api";

const ManageSubSectors = ({
  params: { lng, step, inventory },
}: {
  params: { lng: string; step: string; inventory: string };
}) => {
  const { t } = useTranslation(lng, "manage-subsectors");
  // fetch invnetory data
  const {
    data: inventoryData,
    isLoading: isInventoryDataLoading,
    error: inventoryDataError,
  } = api.useGetInventoryProgressQuery(inventory);
  return (
    <Box w="full" bg="background.backgroundLight">
      <Box
        maxW={1090}
        mx="auto"
        px={8}
        display="flex"
        flexDirection="column"
        gap="48px"
      >
        <Heading t={t} />
        <NotationsDefinitionAccordion t={t} />
        <SectorTabs
          t={t}
          inventoryData={inventoryData}
          isInventoryDataLoading={isInventoryDataLoading}
          inventoryDataError={inventoryDataError}
        />
      </Box>
    </Box>
  );
};

export default ManageSubSectors;
