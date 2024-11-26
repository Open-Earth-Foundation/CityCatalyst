"use client";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Card,
  Heading,
  Text,
} from "@chakra-ui/react";

import React, { useState } from "react";
import { format } from "date-fns";
import { de, enUS, es, fr, it, pt } from "date-fns/locale";
import { api } from "@/services/api";
import { useRouter } from "next/navigation";

const localesMap: Record<string, any> = {
  en: enUS,
  es: es,
  pt: pt,
  fr: fr,
  de: de,
  it: it,
};

function YearCard({
  isActive,
  year,
  inventoryId,
  cityId,
  lastUpdate,
  lng,
}: {
  isActive: boolean;
  cityId: string;
  year: number;
  lastUpdate: Date;
  inventoryId: string;
  lng: string;
}) {
  const [setUserInfo] = api.useSetUserInfoMutation();
  const router = useRouter();

  const onClick = () => {
    setUserInfo({ defaultInventoryId: inventoryId, cityId: cityId });
    router.push(`/${inventoryId}`);
  };

  return (
    <Card
      onClick={onClick}
      key={year}
      className="flex flex-row h-[120px] duration-300 cursor-pointer items-center px-4 gap-4 shadow-none"
      backgroundColor={isActive ? "background.neutral" : ""}
      borderWidth="2px"
      border="solid"
      borderColor={isActive ? "interactive.secondary" : "border.neutral"}
      _hover={
        !isActive
          ? {
              backgroundColor: "background.neutral",
            }
          : {}
      }
    >
      <Box className="flex flex-col gap-2">
        <Heading
          fontSize="title.sm"
          fontWeight="medium"
          lineHeight="20"
          letterSpacing="wide"
          color="content.primary"
        >
          {year}
        </Heading>
        <Text
          fontWeight="regular"
          color="interactive.control"
          lineHeight="20"
          letterSpacing="wide"
        >
          Last Update:{" "}
          {format(new Date(lastUpdate), "dd/MM/yyyy", {
            locale: localesMap[lng],
          })}
        </Text>
      </Box>
    </Card>
  );
}

export function YearSelectorCard({
  inventories,
  cityId,
  currentInventoryId,
  lng,
  t,
}: {
  inventories: { year: number; inventoryId: string; lastUpdate: Date }[];
  cityId: string;
  currentInventoryId: string | null;
  lng: string;
  t: Function;
}) {
  const [isAccordionOpen, setAccordionOpen] = useState(false);
  const toggleAccordion = () => setAccordionOpen(!isAccordionOpen);

  return (
    <Box
      backgroundColor="base.light"
      borderRadius="rounded"
      className="max-w-full flex flex-col px-6 py-8"
    >
      <Box className="grid grid-cols-4 gap-4 py-4">
        {inventories.slice(0, 4).map((year, i) => (
          <YearCard
            cityId={cityId}
            key={year.year}
            inventoryId={year.inventoryId}
            isActive={currentInventoryId === year.inventoryId}
            year={year.year}
            lastUpdate={year.lastUpdate}
            lng={lng}
          />
        ))}
      </Box>
      {
        /*if more than 4*/
        inventories.length > 4 && (
          <Box className="w-full items-center justify-center">
            <Accordion border="none" allowToggle w="full">
              <AccordionItem
                backgroundColor="transparent"
                padding={0}
                border="none"
              >
                <AccordionPanel padding={0}>
                  <Box className="grid grid-cols-4 gap-4">
                    {inventories.slice(4).map((year, i) => (
                      <YearCard
                        key={year.year}
                        cityId={cityId}
                        inventoryId={year.inventoryId}
                        isActive={currentInventoryId === year.inventoryId}
                        year={year.year}
                        lastUpdate={year.lastUpdate}
                        lng={lng}
                      />
                    ))}
                  </Box>
                </AccordionPanel>
                <AccordionButton
                  onClick={toggleAccordion}
                  className="flex justify-center"
                  background="none"
                  color="content.tertiary"
                  gap={2}
                >
                  <Text
                    fontFamily="heading"
                    fontWeight="semibold"
                    fontSize="button.md"
                    letterSpacing="wider"
                    fontStyle="normal"
                    className="hover:underline hover:text-[#001EA7]"
                  >
                    {isAccordionOpen ? t("view-less") : t("view-more")}
                  </Text>
                  <AccordionIcon h={7} w={7} />
                </AccordionButton>
              </AccordionItem>
            </Accordion>
          </Box>
        )
      }
    </Box>
  );
}
