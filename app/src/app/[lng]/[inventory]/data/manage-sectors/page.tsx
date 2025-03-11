"use client";

import { Box } from "@chakra-ui/react";
import React from "react";
import Heading from "./Heading";
import { useTranslation } from "@/i18n/client";

const ManageSubSectors = ({
  params: { lng, step, inventory },
}: {
  params: { lng: string; step: string; inventory: string };
}) => {
  const { t } = useTranslation(lng, "manage-subsectors");
  return (
    <Box w="full" bg="background.backgroundLight">
      <Box maxW={1090} mx="auto" px={8}>
        <Heading t={t} />
      </Box>
    </Box>
  );
};

export default ManageSubSectors;
