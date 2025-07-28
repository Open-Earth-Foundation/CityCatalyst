"use client";
import SubSectorCard from "@/components/Cards/SubSectorCard";
import { InventoryResponse, SectorProgress } from "@/util/types";
import { Box, Heading, Icon, Text, SimpleGrid } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import NextLink from "next/link";

import { useState } from "react";
import { SegmentedProgress } from "../SegmentedProgress";
import {
  clamp,
  convertSectorReferenceNumberToNumber,
  formatPercent,
} from "@/util/helpers";
import { TFunction } from "i18next";
import { Trans } from "react-i18next/TransWithoutContext";
// import { AddIcon } from "@chakra-ui/icons";
import { InventoryType, InventoryTypeEnum, ISector } from "@/util/constants";
import { BsPlus } from "react-icons/bs";

import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";

export function SectorCard({
  sectorProgress,
  sector,
  t,
  inventory,
}: {
  sectorProgress?: SectorProgress;
  sector: ISector;
  t: TFunction;
  inventory: InventoryResponse;
}) {
  const [isAccordionOpen, setAccordionOpen] = useState(false);
  const toggleAccordion = () => setAccordionOpen(!isAccordionOpen);

  let totalProgress = 0,
    thirdPartyProgress = 0,
    uploadedProgress = 0;
  if (sectorProgress && sectorProgress.total > 0) {
    thirdPartyProgress = clamp(
      sectorProgress.thirdParty / sectorProgress.total,
    );
    uploadedProgress = clamp(sectorProgress.uploaded / sectorProgress.total);
    totalProgress = clamp(thirdPartyProgress + uploadedProgress);
  }
  /*** Data ***/
  const {
    icon: sectorIcon,
    description: sectorDescription,
    name: sectorName,
  } = sector;

  const sectorScopes: number[] =
    sector.inventoryTypes[inventory.inventoryType as InventoryType]?.scopes;

  return (
    <Box
      backgroundColor="base.light"
      borderRadius="rounded"
      maxW="full"
      display="flex"
      flexDirection="column"
      minH="268px"
      px={6}
      py={8}
    >
      <Box display="flex" gap={5} w="full">
        <Box display="flex" alignItems="flex-start" mt={2}>
          <Icon color="content.link" boxSize={8} as={sectorIcon} />
        </Box>
        <Box w="full">
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box display="flex" flexDirection="column">
              <Box display="flex" gap={2} py={1}>
                <Heading
                  fontSize="title.lg"
                  fontWeight="semibold"
                  lineHeight="24"
                  pb="8px"
                  data-testid={sectorName}
                >
                  {t(sectorName)}
                </Heading>
              </Box>
              <Text
                color="interactive.control"
                fontSize="body.lg"
                lineHeight="24"
                letterSpacing="wide"
              >
                {t(sectorDescription)}
              </Text>
              <Heading
                fontWeight="semibold"
                fontSize="body.md"
                lineHeight="20"
                letterSpacing="wide"
                py="16px"
              >
                {InventoryTypeEnum.GPC_BASIC_PLUS === inventory?.inventoryType
                  ? t("scope-required-for-gpc+")
                  : t("scope-required-for-gpc")}
                {": "}
                {(sectorScopes || [])?.join(", ") || t("none")}
              </Heading>
            </Box>
            <Box>
              <NextLink
                href={`/${inventory.inventoryId}/data/${sector.number}`}
              >
                <Button
                  variant="outline"
                  borderWidth={2}
                  w="256px"
                  h="48px"
                  py="16px"
                  gap={2}
                  ml={2}
                >
                  <BsPlus />
                  <Text fontFamily="heading" fontSize="button.md">
                    <Trans t={t}>add-data-to-sector</Trans>
                  </Text>
                </Button>
              </NextLink>
            </Box>
          </Box>
          <Box
            display="flex"
            w="full"
            justifyContent="space-between"
            alignItems="center"
            gap={6}
          >
            <SegmentedProgress
              values={[thirdPartyProgress, uploadedProgress]}
              colors={["interactive.connected", "interactive.tertiary"]}
              height={2}
            />
            <Text
              fontFamily="heading"
              fontWeight="semibold"
              fontSize="body.md"
              whiteSpace="nowrap"
            >
              {formatPercent(totalProgress)}% <Trans t={t}>completed</Trans>
            </Text>
          </Box>
        </Box>
      </Box>
      <Box w="full" pt="24px" alignItems="center" justifyContent="center">
        <AccordionRoot border="none" w="full" collapsible>
          <AccordionItem value="" border="none">
            <AccordionItemContent padding={0}>
              <Text fontWeight={600}>
                <Trans t={t}>sub-sectors-required</Trans>
              </Text>
              <SimpleGrid columns={3} gap={4} py={4}>
                {sectorProgress?.subSectors?.map((subSector, i) => (
                  <NextLink
                    key={i}
                    href={`/${inventory.inventoryId}/data/${convertSectorReferenceNumberToNumber(sector.referenceNumber)}/${subSector.subsectorId}`}
                  >
                    <SubSectorCard
                      t={t}
                      title={t(subSector.subsectorName ?? "unnamed-sector")}
                      scopes={(sectorScopes || []).join(", ")}
                      isCompleted={subSector.completed}
                      percentageCompletion={
                        (subSector.completedCount / subSector.totalCount) * 100
                      }
                    />
                  </NextLink>
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
                _hover={{ textDecoration: "underline", color: "#001EA7" }}
              >
                {isAccordionOpen ? t("view-less") : t("view-more")}
              </Text>
            </AccordionItemTrigger>
          </AccordionItem>
        </AccordionRoot>
      </Box>
    </Box>
  );
}
