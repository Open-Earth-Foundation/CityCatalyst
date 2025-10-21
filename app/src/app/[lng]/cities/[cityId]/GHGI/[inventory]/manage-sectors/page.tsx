"use client";

import { Box } from "@chakra-ui/react";
import React from "react";
import { useParams } from "next/navigation";
import Heading from "./Heading";
import { useTranslation } from "@/i18n/client";
import NotationsDefinitionAccordion from "./NotationsDefinitionAccordion";
import SectorTabs from "./SectorTabs";
import { Toaster } from "@/components/ui/toaster";
import { getParamValueRequired } from "@/util/helpers";

const ManageSubSectors = () => {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const inventory = getParamValueRequired(params.inventory);

  const { t } = useTranslation(lng, "manage-subsectors");

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
