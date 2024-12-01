"use client";

import { Heading, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { PreferenceCard } from "./PreferenceCard";

import { ACTIVITY_ITEMS } from "../constants";

export default function ActivitiesPage({ t }: { t: TFunction }) {
  function onClick() {}

  return (
    <VStack marginLeft={"5vw"}>
      <Heading my={"6"}>{t("which-activities")}</Heading>
      <Text mb={"6"}>{t("which-activities-description")}</Text>
      <SimpleGrid my={"6"} columns={3} spacing={4}>
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
