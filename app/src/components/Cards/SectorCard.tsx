"use client";
import SubSectorCard from "@/components/Cards/SubSectorCard";
import { InventoryResponse, SectorProgress } from "@/util/types";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Heading,
  Icon,
  Text,
} from "@chakra-ui/react";
import NextLink from "next/link";

import { useState } from "react";
import { SegmentedProgress } from "../SegmentedProgress";
import {
  convertSectorReferenceNumberToNumber,
  formatPercent,
} from "@/util/helpers";
import { TFunction } from "i18next";
import { Trans } from "react-i18next/TransWithoutContext";
import { AddIcon } from "@chakra-ui/icons";
import { InventoryType, InventoryTypeEnum, ISector } from "@/util/constants";

export function SectorCard({
  sectorProgress,
  sector,
  t,
  inventory,
}: {
  sectorProgress: SectorProgress;
  sector: ISector;
  t: TFunction;
  inventory: InventoryResponse;
}) {
  const [isAccordionOpen, setAccordionOpen] = useState(false);
  const toggleAccordion = () => setAccordionOpen(!isAccordionOpen);

  let totalProgress = 0,
    thirdPartyProgress = 0,
    uploadedProgress = 0;
  if (sectorProgress.total > 0) {
    thirdPartyProgress = sectorProgress.thirdParty / sectorProgress.total;
    uploadedProgress = sectorProgress.uploaded / sectorProgress.total;
    totalProgress = thirdPartyProgress + uploadedProgress;
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
      className="max-w-full flex flex-col min-h-[268px] px-6 py-8"
    >
      <Box className="flex gap-5 w-full">
        <Box className="flex items-start mt-2">
          <Icon color="brand.secondary" boxSize={8} as={sectorIcon} />
        </Box>
        <Box className="w-full">
          <Box className="flex items-center justify-between">
            <Box className="flex flex-col">
              <Box className="flex gap-2 py-1">
                <Heading
                  fontSize="title.lg"
                  fontWeight="semibold"
                  lineHeight="24"
                  className="pb-[8px]"
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
                className="py-[16px]"
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
                passHref
                legacyBehavior
              >
                <Button
                  as="a"
                  variant="outline"
                  className="border-2 w-[256px] h-[48px] py-[16px] gap-2"
                  color="brand.secondary"
                  ml={2}
                >
                  <AddIcon />
                  <Text fontFamily="heading" fontSize="button.md">
                    <Trans t={t}>add-data-to-sector</Trans>
                  </Text>
                </Button>
              </NextLink>
            </Box>
          </Box>
          <Box className="flex w-full justify-between items-center just gap-6">
            <SegmentedProgress
              values={[thirdPartyProgress, uploadedProgress]}
              colors={["interactive.connected", "interactive.tertiary"]}
              height={2}
            />
            <Text
              fontFamily="heading"
              fontWeight="semibold"
              fontSize="body.md"
              className="whitespace-nowrap"
            >
              {formatPercent(totalProgress)}% <Trans t={t}>completed</Trans>
            </Text>
          </Box>
        </Box>
      </Box>
      <Box className="w-full pt-[24px] items-center justify-center">
        <Accordion border="none" allowToggle w="full">
          <AccordionItem border="none">
            <AccordionPanel padding={0}>
              <Text className="font-[600]">
                <Trans t={t}>sub-sectors-required</Trans>
              </Text>
              <Box className="grid grid-cols-3 gap-4 py-4">
                {sectorProgress.subSectors.map((subSector, i) => (
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
    </Box>
  );
}
