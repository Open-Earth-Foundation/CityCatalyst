"use client";
import { Card, Box, Text, Heading, SimpleGrid } from "@chakra-ui/react";
import { de, enUS, es, fr, it, pt } from "date-fns/locale";
import { format } from "date-fns";
import React, { useState } from "react";
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

export interface YearSelectorItem {
  year: number;
  inventoryId: string;
  lastUpdate: Date;
}

interface YearCardProps {
  isActive: boolean;
  year: number;
  inventoryId: string;
  lastUpdate: Date;
  lng: string;
  t: TFunction;
  onYearSelect: (yearData: YearSelectorItem) => void;
}

function YearCard({
  isActive,
  year,
  inventoryId,
  lastUpdate,
  lng,
  t,
  onYearSelect,
}: YearCardProps) {
  const onClick = () => {
    onYearSelect({ year, inventoryId, lastUpdate });
  };

  return (
    <Card.Root
      onClick={onClick}
      key={year}
      display="flex"
      flexDirection="row"
      h="120px"
      transitionDuration="300ms"
      cursor="pointer"
      alignItems="center"
      px={4}
      gap={4}
      shadow="none"
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
      <Box display="flex" flexDirection="column" gap={2}>
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

export interface YearSelectorProps {
  inventories: YearSelectorItem[];
  currentInventoryId: string | null;
  lng: string;
  t: TFunction;
  onYearSelect: (yearData: YearSelectorItem) => void;
}

export function YearSelector({
  inventories,
  currentInventoryId,
  lng,
  t,
  onYearSelect,
}: YearSelectorProps) {
  const [isAccordionOpen, setAccordionOpen] = useState(false);
  const toggleAccordion = () => setAccordionOpen(!isAccordionOpen);

  return (
    <Box
      backgroundColor="base.light"
      borderRadius="rounded"
      maxW="full"
      display="flex"
      flexDirection="column"
      px={6}
      py={8}
    >
      <SimpleGrid columns={4} gap={4} py={4}>
        {inventories.slice(0, 4).map((yearData) => (
          <YearCard
            key={yearData.year}
            inventoryId={yearData.inventoryId}
            isActive={currentInventoryId === yearData.inventoryId}
            year={yearData.year}
            lastUpdate={yearData.lastUpdate}
            lng={lng}
            t={t}
            onYearSelect={onYearSelect}
          />
        ))}
      </SimpleGrid>
      {
        /*if more than 4*/
        inventories.length > 4 && (
          <Box w="full" alignItems="center" justifyContent="center">
            <AccordionRoot border="none" collapsible w="full">
              <AccordionItem
                value=""
                backgroundColor="transparent"
                padding={0}
                border="none"
              >
                <AccordionItemContent padding={0}>
                  <SimpleGrid columns={4} gap={4}>
                    {inventories.slice(4).map((yearData) => (
                      <YearCard
                        key={yearData.year}
                        inventoryId={yearData.inventoryId}
                        isActive={currentInventoryId === yearData.inventoryId}
                        year={yearData.year}
                        lastUpdate={yearData.lastUpdate}
                        lng={lng}
                        t={t}
                        onYearSelect={onYearSelect}
                      />
                    ))}
                  </SimpleGrid>
                </AccordionItemContent>
                <AccordionItemTrigger
                  onClick={toggleAccordion}
                  display="flex"
                  justifyContent="center"
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
                    _hover={{
                      textDecoration: "underline",
                      color: "content.alternative",
                    }}
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