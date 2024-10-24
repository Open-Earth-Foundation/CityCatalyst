"use client";

import { SectorCard } from "@/components/Cards/SectorCard";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { CircleIcon } from "@/components/icons";
import { useTranslation } from "@/i18n/client";
import { formatPercent } from "@/util/helpers";
import {
  InventoryProgressResponse,
  InventoryResponse,
  SectorProgress,
} from "@/util/types";
import {
  Box,
  Center,
  Heading,
  Spinner,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
} from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";
import { TabHeader } from "@/components/HomePage/TabHeader";
import { undefined } from "zod";
import { BlueSubtitle } from "@/components/blue-subtitle";

function sortSectors(a: SectorProgress, b: SectorProgress): number {
  const refA = a.sector.referenceNumber;
  const refB = b.sector.referenceNumber;
  if (!refA || !refB) {
    return 0;
  } else if (refA < refB) {
    return -1;
  } else if (refA > refB) {
    return 1;
  }
  return 0;
}

const getSectorProgresses = (
  inventoryProgress: InventoryProgressResponse | undefined,
) =>
  inventoryProgress?.sectorProgress
    .slice()
    .filter((sectorProgress) => {
      return ["I", "II", "III"].includes(
        sectorProgress.sector.referenceNumber || "",
      );
    })
    .sort(sortSectors) || [];

export default function InventoryCalculationTab({
  lng,
  inventory,
  isUserInfoLoading,
  isInventoryProgressLoading,
  inventoryProgress,
}: {
  lng: string;
  inventory?: InventoryResponse;
  isUserInfoLoading?: boolean;
  isInventoryProgressLoading?: boolean;
  inventoryProgress?: InventoryProgressResponse;
}) {
  const { t } = useTranslation(lng, "dashboard");
  let totalProgress = 0,
    thirdPartyProgress = 0,
    uploadedProgress = 0;
  if (inventoryProgress && inventoryProgress.totalProgress.total > 0) {
    const { uploaded, thirdParty, total } = inventoryProgress.totalProgress;
    totalProgress = (uploaded + thirdParty) / total;
    thirdPartyProgress = thirdParty / total;
    uploadedProgress = uploaded / total;
  }
  return (
    <>
      {inventory && (
        <Box className="flex flex-col gap-[8px] w-full">
          <TabHeader
            t={t}
            year={inventory?.year}
            title={"emission-inventory-calculation-title"}
          />
          <Box className="flex w-full justify-between items-center mt-2 gap-6">
            <SegmentedProgress
              values={[thirdPartyProgress, uploadedProgress]}
              colors={["interactive.connected", "interactive.tertiary"]}
            />
            <Heading
              fontWeight="semibold"
              fontSize="body.md"
              className="whitespace-nowrap"
            >
              {formatPercent(totalProgress)}% <Trans t={t}>completed</Trans>
            </Heading>
          </Box>
          <Box className="flex gap-4 mt-2">
            <Tag>
              <TagLeftIcon
                as={CircleIcon}
                boxSize={6}
                color="interactive.connected"
              />
              <TagLabel>
                {formatPercent(thirdPartyProgress)}%{" "}
                <Trans t={t}>connect-third-party-data</Trans>
              </TagLabel>
            </Tag>
            <Tag>
              <TagLeftIcon
                as={CircleIcon}
                boxSize={6}
                color="interactive.tertiary"
              />
              <TagLabel>
                {formatPercent(uploadedProgress)}%{" "}
                <Trans t={t}>uploaded-data</Trans>
              </TagLabel>
            </Tag>
          </Box>
          <Box className=" flex flex-col gap-[24px] py-[24px]">
            <BlueSubtitle t={t} text={"sector-data"} />
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontWeight="semibold"
              lineHeight="24"
            >
              <Trans t={t}>sector-emissions</Trans>
            </Text>
            <Text>
              <Trans t={t}>view-progress-in-each-sector</Trans>
            </Text>
            {isUserInfoLoading || isInventoryProgressLoading ? (
              <Center>
                <Spinner size="lg" />
              </Center>
            ) : (
              getSectorProgresses(inventoryProgress).map(
                (sectorProgress, i) => (
                  <SectorCard
                    key={i}
                    sectorProgress={sectorProgress}
                    stepNumber={i + 1}
                    t={t}
                    inventory={inventory?.inventoryId}
                  />
                ),
              )
            )}
          </Box>
        </Box>
      )}
    </>
  );
}
