"use client";

import { Box } from "@chakra-ui/react";
import React from "react";
import { useParams } from "next/navigation";
import Heading from "@/app/[lng]/cities/[cityId]/GHGI/[inventory]/manage-sectors/Heading";
import { useTranslation } from "@/i18n/client";
import NotationsDefinitionAccordion from "@/app/[lng]/cities/[cityId]/GHGI/[inventory]/manage-sectors/NotationsDefinitionAccordion";
import SectorTabs from "@/app/[lng]/cities/[cityId]/GHGI/[inventory]/manage-sectors/SectorTabs";
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
        <Heading t={t} />
        <NotationsDefinitionAccordion t={t} />
        <SectorTabs t={t} inventoryId={inventory} />
      </Box>
      <Toaster />
    </Box>
  );
};

export default ManageSubSectors;
