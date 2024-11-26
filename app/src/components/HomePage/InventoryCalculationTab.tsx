"use client";

import { SectorCard } from "@/components/Cards/SectorCard";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { CircleIcon } from "@/components/icons";
import { useTranslation } from "@/i18n/client";
import { formatPercent } from "@/util/helpers";
import { InventoryProgressResponse, InventoryResponse } from "@/util/types";
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
import { BlueSubtitle } from "@/components/blue-subtitle";
import {
  getSectorsForInventory,
  InventoryType,
  SECTORS,
} from "@/util/constants";

const getSectorProgresses = (
  inventoryProgress: InventoryProgressResponse,
  referenceNumber: string,
) =>
  inventoryProgress.sectorProgress.find(
    (sectorProgress) =>
      sectorProgress.sector.referenceNumber === referenceNumber,
  )!;

export default function InventoryCalculationTab({
  lng,
  inventory,
  isInventoryProgressLoading,
  inventoryProgress,
}: {
  lng: string;
  inventory?: InventoryResponse;
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

  const sectorsForInventory = inventory
    ? getSectorsForInventory(inventory.inventoryType)
    : [];
  return (
    <>
      {inventory && (
        <Box className="flex flex-col gap-[8px] w-full">
          <TabHeader
            t={t}
            inventory={inventory}
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
            {isInventoryProgressLoading ? (
              <Center>
                <Spinner size="lg" />
              </Center>
            ) : (
              sectorsForInventory.map((sector, i) => (
                <SectorCard
                  key={sector.name}
                  sectorProgress={getSectorProgresses(
                    inventoryProgress!,
                    sector.referenceNumber,
                  )}
                  sector={SECTORS[i]}
                  t={t}
                  inventory={inventory}
                />
              ))
            )}
          </Box>
        </Box>
      )}
    </>
  );
}
