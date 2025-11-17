"use client";

import { SectorCard } from "@/components/Cards/SectorCard";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { CircleIcon } from "@/components/icons";
import { useTranslation } from "@/i18n/client";
import { clamp, formatPercent } from "@/util/helpers";
import { InventoryProgressResponse, InventoryResponse } from "@/util/types";
import {
  Badge,
  Box,
  Center,
  Heading,
  Icon,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";
import { TabHeader } from "@/components/GHGIHomePage/TabHeader";
import { BlueSubtitle } from "@/components/package/Texts/BlueSubtitle";
import { getSectorsForInventory, SECTORS } from "@/util/constants";

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
    uploadedProgress = 0,
    reasonNEProgress = 0,
    reasonNOProgress = 0;
  if (inventoryProgress && inventoryProgress.totalProgress.total > 0) {
    const { uploaded, thirdParty, reasonNE, reasonNO, total } =
      inventoryProgress.totalProgress;
    totalProgress = clamp(
      (uploaded + thirdParty + reasonNE + reasonNO) / total,
    );
    thirdPartyProgress = clamp(thirdParty / total);
    uploadedProgress = clamp(uploaded / total);
    reasonNEProgress = clamp(reasonNE / total);
    reasonNOProgress = clamp(reasonNO / total);
  }

  const sectorsForInventory = inventory
    ? getSectorsForInventory(inventory.inventoryType)
    : [];
  return (
    <>
      {inventory && (
        <Box display="flex" flexDirection="column" gap={2} w="full">
          <TabHeader
            t={t}
            inventory={inventory}
            title={"emission-inventory-calculation-title"}
          />
          <Box
            display="flex"
            w="full"
            justifyContent="space-between"
            alignItems="center"
            mt={2}
            gap={6}
          >
            <SegmentedProgress
              values={[
                thirdPartyProgress,
                uploadedProgress,
                reasonNEProgress,
                reasonNOProgress,
              ]}
              colors={[
                "interactive.connected",
                "interactive.tertiary",
                "interactive.control",
                "striped",
              ]}
            />
            <Heading
              fontWeight="semibold"
              fontSize="body.md"
              whiteSpace="nowrap"
            >
              {formatPercent(totalProgress)}% <Trans t={t}>completed</Trans>
            </Heading>
          </Box>
          <Box display="flex" gap={4} mt={2}>
            <Badge>
              <Icon as={CircleIcon} boxSize={6} color="interactive.connected" />
              {formatPercent(thirdPartyProgress)}%{" "}
              <Trans t={t}>connect-third-party-data</Trans>
            </Badge>
            <Badge>
              <Icon as={CircleIcon} boxSize={6} color="interactive.tertiary" />
              {formatPercent(uploadedProgress)}%{" "}
              <Trans t={t}>uploaded-data</Trans>
            </Badge>
            <Badge>
              <Icon as={CircleIcon} boxSize={6} color="interactive.control" />
              {formatPercent(reasonNEProgress)}% "NE" - Not Estimated
            </Badge>
            <Badge>
              <Box
                boxSize={3}
                borderRadius="full"
                backgroundImage="repeating-linear-gradient(45deg, #C5CBF5, #C5CBF5 2px, transparent 2px, transparent 4px)"
              />
              {formatPercent(reasonNOProgress)}% "NO" - Not Occurring
            </Badge>
          </Box>
          <Box display="flex" flexDirection="column" gap={8} py={8}>
            <BlueSubtitle t={t} text={"sector-data"} />
            <Text
              fontFamily="heading"
              fontSize="title.md"
              fontWeight="semibold"
              lineHeight="24"
              data-testid="sector-data-title"
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
              inventoryProgress &&
              sectorsForInventory.map((sector, i) => (
                <SectorCard
                  key={sector.name}
                  sectorProgress={getSectorProgresses(
                    inventoryProgress,
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
