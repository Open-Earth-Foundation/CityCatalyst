"use client";

import { Box } from "@chakra-ui/react";
import React from "react";
import { useParams } from "next/navigation";
import Heading from "@/app/[lng]/cities/[cityId]/GHGI/[inventory]/manage-sectors/Heading";
import { useTranslation } from "@/i18n/client";
import SectorTabs from "@/app/[lng]/cities/[cityId]/GHGI/[inventory]/manage-sectors/SectorTabs";
import { Toaster } from "@/components/ui/toaster";
import { getParamValueRequired } from "@/util/helpers";
import Footer from "@/components/Sections/Footer";

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
        pb="xxl-4"
        display="flex"
        flexDirection="column"
        gap="48px"
      >
        <Heading t={t} />
        <SectorTabs t={t} inventoryId={inventory} />
      </Box>
      <Footer lng={lng} />
      <Toaster />
    </Box>
  );
};

export default ManageSubSectors;
