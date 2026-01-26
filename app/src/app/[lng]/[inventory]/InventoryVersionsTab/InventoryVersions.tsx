"use client";

import { InventoryResponse } from "@/util/types";
import {
  Box,
  Button,
  Heading,
  HStack,
  Icon,
  Spacer,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import {
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdPersonOutline,
  MdReplay,
  MdRestore,
} from "react-icons/md";
import { TFunction } from "i18next";
import { useState } from "react";
import { formatEmissions } from "@/util/helpers";
import { api } from "@/services/api";

function toEmissionsString(totalEmissions: number): string {
  const { value, unit } = formatEmissions(totalEmissions);
  return `${value} ${unit}CO2e`;
}

function VersionEntry({ t, isCurrent }: { t: TFunction; isCurrent: boolean }) {
  const date = new Date();
  const month = date.toLocaleString("default", { month: "long" });
  const formattedDate = `${month} ${date.getDate()}, ${date.getFullYear()} - ${date.getHours()}:${date.getMinutes()}`;
  const [isExpanded, setExpanded] = useState(false);
  const userName = "Maria Rossi";

  const changes = [
    {
      subSector: "I.1 Residential Buildings",
      totalEmissions: 342.5,
      sectorPercentage: 0.453,
      scope1: 456.7,
      scope2: 901.2,
      scope3: 12.34,
      source: "IEA",
      author: "Maria Rossi",
      date: new Date(),
    },
  ];
  changes[1] = changes[0];
  changes[2] = changes[0];

  return (
    <Box
      w="full"
      borderRadius="8px"
      background="background.alternativeLight"
      borderColor="border.neutral"
      borderWidth="1px"
    >
      <Box
        w="full"
        borderRadius="8px"
        borderWidth="2px"
        borderColor={isExpanded ? "interactive.secondary" : "border.neutral"}
        background="background.alternativeLight"
        _hover={{
          borderColor: "interactive.secondary",
        }}
        p={6}
        onClick={() => setExpanded(!isExpanded)}
      >
        <HStack>
          <VStack gap="0" alignItems="start">
            <HStack gap="19px">
              <Text fontSize="16px" fontWeight="600" lineHeight="24px">
                {t("inventory-versions-from")} {formattedDate}
              </Text>
              <Box
                padding="4px 16px"
                background="interactive.secondary"
                color="base.light"
                borderRadius="100px"
                fontWeight="600"
              >
                V3.1
              </Box>
              {isCurrent && (
                <Box
                  padding="4px 16px"
                  background="background.neutral"
                  color="interactive.secondary"
                  borderRadius="100px"
                  fontWeight="600"
                  textTransform="uppercase"
                >
                  {t("inventory-versions-current")}
                </Box>
              )}
            </HStack>
            <Text
              color="content.secondary"
              fontSize="14px"
              fontWeight="400"
              lineHeight="20px"
              letterSpacing="0.5px"
              fontFamily="Open Sans"
            >
              <Icon
                as={MdPersonOutline}
                boxSize={6}
                color="interactive.control"
              />
              {userName}
            </Text>
          </VStack>
          <Spacer />
          {!isCurrent && (
            <Button variant="outline">
              <Icon as={MdReplay} />
              {t("inventory-versions-restore")}
            </Button>
          )}
          <Icon
            as={isExpanded ? MdKeyboardArrowUp : MdKeyboardArrowDown}
            boxSize={6}
            color="interactive.control"
          />
        </HStack>
      </Box>
      {isExpanded && (
        <VStack p={6} gap={6} alignItems="start">
          <VStack
            w="full"
            alignItems="start"
            borderRadius="8px"
            borderColor="border.neutral"
            borderWidth="1px"
            gap={2}
            p={6}
          >
            <Text fontSize="16px" fontWeight="600" lineHeight="24px">
              {t("inventory-versions-changes")}
            </Text>
            {[0, 1, 2].map((i) => (
              <Text
                key={i}
                color="content.secondary"
                fontSize="14px"
                fontWeight="400"
                lineHeight="20px"
                letterSpacing="0.5px"
                fontFamily="Open Sans"
              >
                {t("inventory-versions-value-source-change-entry", {
                  name: userName,
                  refNo: "I.1.1",
                  sourceA: "GPC",
                  sourceB: "IEA",
                  totalA: 15.22,
                  totalB: 22.91,
                })}
              </Text>
            ))}
          </VStack>

          <HStack
            gap={0}
            color="content.secondary"
            fontSize="14px"
            fontWeight="400"
            lineHeight="20px"
            letterSpacing="0.5px"
            fontFamily="Open Sans"
            verticalAlign="center"
          >
            <Box
              borderWidth="1px"
              borderRadius="4px"
              borderColor="sentiment.positiveDefault"
              background="sentiment.positiveOverlay"
              width={4}
              height={4}
              display="inline-block"
              mr={2}
              mt={0.5}
            />
            {t("inventory-versions-value-increased")}
            <Box
              borderWidth="1px"
              borderRadius="4px"
              borderColor="sentiment.negativeDefault"
              background="sentiment.negativeOverlay"
              width={4}
              height={4}
              display="inline-block"
              ml={4}
              mr={2}
              mt={0.5}
            />
            {t("inventory-versions-value-decreased")}
            <Box
              borderWidth="1px"
              borderRadius="4px"
              borderColor="sentiment.warningDefault"
              background="sentiment.warningOverlay"
              width={4}
              height={4}
              display="inline-block"
              ml={4}
              mr={2}
              mt={0.5}
            />
            {t("inventory-versions-value-source-changed")}
          </HStack>

          <Table.Root
            variant="outline"
            borderStyle="solid"
            borderWidth="1px"
            borderColor="border.overlay"
            borderRadius="12px"
          >
            <Table.Header
              bg="background.backgroundLight"
              textTransform="uppercase"
            >
              <Table.Row>
                <Table.ColumnHeader>{t("subsector")}</Table.ColumnHeader>
                <Table.ColumnHeader>{t("total-emissions")}</Table.ColumnHeader>
                <Table.ColumnHeader>
                  {t("sector-percentage")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>{t("scope-1")}</Table.ColumnHeader>
                <Table.ColumnHeader>{t("scope-2")}</Table.ColumnHeader>
                <Table.ColumnHeader>{t("scope-3")}</Table.ColumnHeader>
                <Table.ColumnHeader>{t("source")}</Table.ColumnHeader>
                <Table.ColumnHeader>{t("last-modified-by")}</Table.ColumnHeader>
                <Table.ColumnHeader>{t("date")}</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body
              fontFamily="heading"
              color="content.primary"
              fontSize="body.md"
            >
              {changes.map((change, i) => (
                <Table.Row key={i}>
                  <Table.Cell>{change.subSector}</Table.Cell>
                  <Table.Cell
                    bgColor="sentiment.positiveOverlay"
                    color="sentiment.positiveDefault"
                  >
                    {change.totalEmissions} {"kT CO2e"}
                  </Table.Cell>
                  <Table.Cell
                    bgColor="sentiment.negativeOverlay"
                    color="sentiment.negativeDefault"
                  >
                    {(change.sectorPercentage * 100).toFixed(1)}%
                  </Table.Cell>
                  <Table.Cell>
                    {change.scope1} {"kT CO2e"}
                  </Table.Cell>
                  <Table.Cell>
                    {change.scope2} {"kT CO2e"}
                  </Table.Cell>
                  <Table.Cell>
                    {change.scope3} {"kT CO2e"}
                  </Table.Cell>
                  <Table.Cell>{change.source}</Table.Cell>
                  <Table.Cell>{change.author}</Table.Cell>
                  <Table.Cell>
                    {change.date.toLocaleString("default")}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </VStack>
      )}
    </Box>
  );
}

export default function InventoryVersions({
  lng,
  inventoryId,
}: {
  lng: string;
  inventoryId?: string;
}) {
  const { t } = useTranslation(lng, "dashboard");

  const { data, isLoading } = api.useGetVersionHistoryQuery(
    { inventoryId: inventoryId! },
    { skip: !inventoryId },
  );

  return (
    <VStack alignItems="start" gap={4} mt={1}>
      <HStack gap={4} mb={4}>
        <Icon as={MdRestore} boxSize="32px" color="interactive.secondary" />
        <VStack gap={4} w="full" alignItems="start">
          <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
            {t("inventory-versions-title")}
          </Heading>
          <Text
            fontWeight="regular"
            fontSize="body.lg"
            color="interactive.control"
            letterSpacing="wide"
          >
            {t("inventory-versions-description")}
          </Text>
        </VStack>
      </HStack>
      {[0, 1, 2].map((i) => (
        <VersionEntry key={i} t={t} isCurrent={i === 0} />
      ))}
    </VStack>
  );
}
