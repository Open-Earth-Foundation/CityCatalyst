"use client";
import {
  Card,
  Box,
  Text,
  Heading,
  SimpleGrid,
  useBreakpointValue,
} from "@chakra-ui/react";
import { de, enUS, es, fr, it, pt } from "date-fns/locale";
import { format, Locale } from "date-fns";
import React, { useState } from "react";
import { TFunction } from "i18next";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";

const localesMap: Record<string, Locale> = {
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
      asChild
      display="flex"
      w="full"
      minW={0}
      textAlign="start"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      p="l"
      gap="m"
      borderRadius="rounded"
      transitionDuration="300ms"
      cursor="pointer"
      shadow="none"
      backgroundColor={isActive ? "background.neutral" : ""}
      borderWidth="1px"
      borderStyle="solid"
      borderColor={isActive ? "interactive.secondary" : "border.overlay"}
      color={isActive ? "content.link" : "content.secondary"}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "content.link",
        outlineOffset: "2px",
      }}
      _hover={
        !isActive
          ? {
              backgroundColor: "background.neutral",
            }
          : {}
      }
    >
      <button type="button" aria-pressed={isActive} onClick={onClick}>
        <Box
          as="span"
          display="flex"
          flexDirection="column"
          gap={2}
          maxW="full"
        >
          <Heading
            as="span"
            fontFamily="heading"
            fontSize="button.lg"
            fontWeight="semibold"
            lineHeight="24"
            letterSpacing="wider"
            textTransform="uppercase"
            color="content.link"
            overflow="hidden"
            whiteSpace="nowrap"
            textOverflow="ellipsis"
          >
            <span data-testid="inventory-year">{year}</span>
          </Heading>
          <Text
            as="span"
            fontFamily="body"
            fontSize="body.md"
            fontWeight="regular"
            color="content.tertiary"
            lineHeight="20"
            letterSpacing="wide"
            overflow="hidden"
            whiteSpace="nowrap"
            textOverflow="ellipsis"
            data-testid="inventory-last-updated"
          >
            {t("last-update")}:{" "}
            {format(new Date(lastUpdate), "dd/MM/yyyy", {
              locale: localesMap[lng],
            })}
          </Text>
        </Box>
      </button>
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
  const selectedInventory =
    inventories.find((item) => item.inventoryId === currentInventoryId) ??
    inventories[0];
  const visibleCount =
    useBreakpointValue({ base: 1, md: 2, lg: 3, xl: 4 }) ?? 1;
  const visibleInventories =
    visibleCount === 1
      ? selectedInventory
        ? [selectedInventory]
        : []
      : inventories.slice(0, visibleCount);
  const otherInventories = inventories.filter(
    (item) => !visibleInventories.includes(item),
  );

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
      <Heading
        fontFamily="heading"
        fontSize="title.md"
        fontWeight="semibold"
        lineHeight="24"
        color="content.secondary"
      >
        {t("inventories-by-year")}
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap={4} py={4}>
        {visibleInventories.map((yearData) => (
          <YearCard
            key={yearData.inventoryId}
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
      {otherInventories.length > 0 && (
        <Box w="full" alignItems="center" justifyContent="center">
          <AccordionRoot border="none" collapsible w="full">
            <AccordionItem
              value=""
              backgroundColor="transparent"
              padding={0}
              border="none"
            >
              <AccordionItemContent padding={0}>
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap={4}>
                  {otherInventories.map((yearData) => (
                    <YearCard
                      key={yearData.inventoryId}
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
                mt={isAccordionOpen ? 4 : 0}
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
      )}
    </Box>
  );
}
