"use client";

import { Box, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import Image from "next/image";
import type { TFunction } from "i18next";

export default function PreferencesExplanation({ t }: { t: TFunction }) {
  return (
    <HStack marginLeft={"5vw"}>
      <VStack align={"left"} flex={1} marginLeft={"5vw"}>
        <Text
          fontFamily="heading"
          fontSize="title.md"
          fontWeight="semibold"
          lineHeight="24"
          my={4}
          textColor={"blue"}
        >
          {t("city-inventory-preferences").toUpperCase()}
        </Text>
        <Heading>
          <Text color={"n"}>{t("make-inventory-simpler-accurate")}</Text>
        </Heading>
        <Text>{t("discover-sub-sectors-for-city")}</Text>
      </VStack>
      <Box width="70vh" height="70vh" position="relative" flex={2}>
        <Image
          src="/assets/preferences/inventory_preferences_image.svg"
          layout="fill"
          objectFit="contain"
          alt={"city"}
        />
      </Box>
    </HStack>
  );
}
