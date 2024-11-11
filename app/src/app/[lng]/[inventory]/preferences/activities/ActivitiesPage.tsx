"use client";

import { Heading, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { PreferenceCard } from "@/app/[lng]/[inventory]/preferences/activities/PreferenceCard";
import { ACTIVITY_ITEMS } from "@/app/[lng]/[inventory]/preferences/activities/ACTIVITY_ITEMS";

export default function ActivitiesPage({ t }: { t: TFunction }) {
  function onClick() {}

  return (
    <VStack marginLeft={"5vw"}>
      <Heading my={"24px"}>{t("which-activities")}</Heading>
      <Text mb={"24px"}>{t("which-activities-description")}</Text>
      <SimpleGrid my={"24px"} columns={3} spacing={4}>
        {ACTIVITY_ITEMS.map(({ id, icon }) => (
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
