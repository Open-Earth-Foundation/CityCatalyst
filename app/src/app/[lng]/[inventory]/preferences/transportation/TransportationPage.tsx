"use client";

import { Heading, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { PreferenceCard } from "@/app/[lng]/[inventory]/preferences/activities/PreferenceCard";

import { TRANSPORTATION_ITEMS } from "@/app/[lng]/[inventory]/preferences/constants";

export default function TransportationPage({ t }: { t: TFunction }) {
  function onClick() {}

  return (
    <VStack marginLeft={"5vw"}>
      <Heading my={"6"}>{t("which-transportation")}</Heading>
      <Text mb={"6"}>{t("which-transportation-description")}</Text>
      <SimpleGrid my={"6"} columns={3} spacing={4}>
        {TRANSPORTATION_ITEMS.map(({ id, icon }) => (
          <PreferenceCard
            key={id}
            onClick={onClick}
            src={icon}
            title={id}
            t={t}
          />
        ))}
      </SimpleGrid>
    </VStack>
  );
}
