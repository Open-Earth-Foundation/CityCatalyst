"use client";

import { Box } from "@chakra-ui/react";
import React, { use } from "react";
import Heading from "./Heading";
import { useTranslation } from "@/i18n/client";
import NotationsDefinitionAccordion from "./NotationsDefinitionAccordion";
import SectorTabs from "./SectorTabs";
import { api } from "@/services/api";
import { Toaster } from "@/components/ui/toaster";

const ManageSubSectors = (props: {
  params: Promise<{ lng: string; step: string; inventory: string }>;
}) => {
  const { lng, step, inventory } = use(props.params);

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
        <Heading t={t} inventoryParam={inventory} />
        <NotationsDefinitionAccordion t={t} />
        <SectorTabs t={t} inventoryId={inventory} />
      </Box>
      <Toaster />
    </Box>
  );
};

export default ManageSubSectors;
