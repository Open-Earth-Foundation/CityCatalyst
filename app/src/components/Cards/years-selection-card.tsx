"use client";
import { Box, Card, Heading, Text } from "@chakra-ui/react";

import React, { useState } from "react";
import { format } from "date-fns";
import { de, enUS, es, fr, it, pt } from "date-fns/locale";
import { api } from "@/services/api";
import { useRouter } from "next/navigation";
import { TFunction } from "i18next";

import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";

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
  t,
}: {
  isActive: boolean;
  cityId: string;
  year: number;
  lastUpdate: Date;
  inventoryId: string;
  lng: string;
  t: TFunction;
}) {
  const [setUserInfo] = api.useSetUserInfoMutation();
  const router = useRouter();

  const onClick = () => {
    setUserInfo({ defaultInventoryId: inventoryId, cityId: cityId });
    router.push(`/${inventoryId}`);
  };

  return (
    <Card.Root
      onClick={onClick}
      key={year}
      className="flex flex-row h-[120px] duration-300 cursor-pointer items-center px-4 gap-4 shadow-none"
      backgroundColor={isActive ? "background.neutral" : ""}
      borderWidth="2px"
      border="solid"
      borderColor={isActive ? "interactive.secondary" : "border.overlay"}
      color={isActive ? "content.link" : "content.secondary"}
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
        >
          <span data-testid="inventory-year">{year}</span>
        </Heading>
        <Text
          fontWeight="regular"
          color="content.tertiary"
          lineHeight="20"
          letterSpacing="wide"
          data-testid="inventory-last-updated"
        >
          {t("last-update")}:{" "}
          {format(new Date(lastUpdate), "dd/MM/yyyy", {
            locale: localesMap[lng],
          })}
        </Text>
      </Box>
    </Card.Root>
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
  t: TFunction;
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
            t={t}
          />
        ))}
      </Box>
      {
        /*if more than 4*/
        inventories.length > 4 && (
          <Box className="w-full items-center justify-center">
            <AccordionRoot border="none" collapsible w="full">
              <AccordionItem
                value=""
                backgroundColor="transparent"
                padding={0}
                border="none"
              >
                <AccordionItemContent padding={0}>
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
                        t={t}
                      />
                    ))}
                  </Box>
                </AccordionItemContent>
                <AccordionItemTrigger
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
                </AccordionItemTrigger>
              </AccordionItem>
            </AccordionRoot>
          </Box>
        )
      }
    </Box>
  );
}
