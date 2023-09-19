"use client";
import SubSectorCard from "@/components/Cards/SubSectorCard";
import { SectorProgress } from "@/util/types";
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
import { MdArrowForward } from "react-icons/md";
import NextLink from "next/link";
import { BsTruck } from "react-icons/bs";
import { PiTrashLight } from "react-icons/pi";
import { TbBuildingCommunity } from "react-icons/tb";
import { useState } from "react";
import { SegmentedProgress } from "../SegmentedProgress";
import { formatPercent } from "@/util/helpers";

export function SectorCard({
  sectorProgress,
  stepNumber,
}: {
  sectorProgress: SectorProgress;
  stepNumber: number;
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
  const sectorIcons = [TbBuildingCommunity, BsTruck, PiTrashLight];
  const sectorIcon = sectorIcons[stepNumber - 1];
  // TODO get from API or use i18n strings
  const sectorDescriptions = [
    "This sector deals with emissions that result from the generation of electricity, heat, and steam, as well as their consumption.",
    "This sector deals with emissions from the transportation of goods and people within the city boundary.",
    "This sector covers emissions generated from waste management processes.",
  ];
  const sectorDescription = sectorDescriptions[stepNumber - 1];
  const sectorScopesList = [
    [1, 2],
    [1, 2],
    [1, 2],
  ];
  const sectorScopes = sectorScopesList[stepNumber - 1];

  return (
    <Box
      backgroundColor="base.light"
      borderRadius="rounded"
      className="w-full flex flex-col min-h-[268px] px-6 py-8"
    >
      <Box className="flex gap-5">
        <Box className="flex items-start mt-2">
          <Icon color="brand.secondary" boxSize={8} as={sectorIcon} />
        </Box>
        <Box>
          <Box className="flex items-center justify-between">
            <Box className="flex flex-col">
              <Box className="flex gap-2 py-1 w-[715px]">
                <Heading
                  fontSize="title.lg"
                  fontWeight="semibold"
                  lineHeight="24"
                  className="pb-[8px]"
                >
                  {sectorProgress.sector.sectorName}
                </Heading>
              </Box>
              <Text
                color="interactive.control"
                fontSize="body.lg"
                lineHeight="24"
                letterSpacing="wide"
              >
                {sectorDescription}
              </Text>
              <Heading
                fontWeight="semibold"
                fontSize="body.md"
                lineHeight="20"
                letterSpacing="wide"
                className="py-[16px]"
              >
                Scope Required for GPC Basic Inventory:{" "}
                {sectorScopes.join(", ")}
              </Heading>
            </Box>
            <Box>
              <NextLink href={`/data/${stepNumber}`} passHref legacyBehavior>
                <Button
                  as="a"
                  variant="outline"
                  className="border-2 w-[256px] h-[48px] py-[16px] gap-2"
                  color="brand.secondary"
                >
                  <Text fontFamily="heading" fontSize="button.md">
                    ADD DATA TO SECTOR
                  </Text>
                  <MdArrowForward size={24} />
                </Button>
              </NextLink>
            </Box>
          </Box>
          <Box className="flex w-full justify-between items-center just gap-6">
            <SegmentedProgress
              values={[thirdPartyProgress, uploadedProgress]}
              colors={["interactive.connected", "interactive.tertiary"]}
            />
            <Text
              fontFamily="heading"
              fontWeight="semibold"
              fontSize="body.md"
              className="whitespace-nowrap"
            >
              {formatPercent(totalProgress)}% Completed
            </Text>
          </Box>
        </Box>
      </Box>
      <Box className="w-full pt-[24px] items-center justify-center">
        <Accordion border="none" allowToggle w="full">
          <AccordionItem border="none">
            <AccordionPanel padding={0}>
              <Text className="font-[600]">Sub-sectors required</Text>
              <Box className="grid grid-cols-3 gap-4 py-4">
                {sectorProgress.subSectors.map((subSector, i) => (
                  <SubSectorCard
                    key={i}
                    title={subSector.subsectorName}
                    scopes="1, 2"
                    isCompleted={subSector.completed}
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
                {isAccordionOpen ? "VIEW LESS" : "VIEW MORE"}
              </Text>
              <AccordionIcon h={7} w={7} />
            </AccordionButton>
          </AccordionItem>
        </Accordion>
      </Box>
    </Box>
  );
}
