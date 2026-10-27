"use client";

import { Box } from "@chakra-ui/react";
import Image from "next/image";
import { useTranslation } from "@/i18n/client";
import { BodyXLarge } from "@/components/package/Texts/Body";
import { DisplayLarge } from "@/components/package/Texts/Display";

const ProjectNotFound = ({ lng }: { lng: string }) => {
  const { t } = useTranslation(lng, "dashboard");

  return (
    <Box
      display="flex"
      w="full"
      justifyContent="center"
      position="relative"
      h="100vh"
      zIndex={10}
    >
      <Image
        src="/assets/not-found-background.svg"
        fill
        style={{ objectFit: "cover" }}
        sizes="100vw"
        alt="not-found page background"
      />
      <Box
        display="flex"
        flexDir="column"
        alignItems="center"
        justifyContent="center"
        h="full"
        w="full"
        maxW="708px"
        zIndex="10"
      >
        <DisplayLarge mb="24px" textAlign="center" color="content.alternative">
          {t("project-not-found")}
        </DisplayLarge>
        <BodyXLarge textAlign="center" color="content.tertiary">
          {t("project-not-found-description")}
        </BodyXLarge>
      </Box>
    </Box>
  );
};

export default ProjectNotFound;
