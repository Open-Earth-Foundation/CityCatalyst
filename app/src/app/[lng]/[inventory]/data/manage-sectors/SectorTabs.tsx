import { InventoryProgressResponse } from "@/util/types";
import { Box, Tabs, Text } from "@chakra-ui/react";
import { SerializedError } from "@reduxjs/toolkit";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { TFunction } from "i18next";
import React, { FC, useEffect } from "react";
import { SubSectorWithRelations } from "../[step]/types";

interface SectorTabsProps {
  t: TFunction;
  inventoryData: InventoryProgressResponse | undefined;
  isInventoryDataLoading: boolean;
  inventoryDataError: FetchBaseQueryError | SerializedError | undefined;
}

const SectorTabs: FC<SectorTabsProps> = ({
  inventoryData,
  inventoryDataError,
  isInventoryDataLoading,
  t,
}) => {
  const [unfinishedSubsectorsData, setUnfinishedSubsectorsData] =
    React.useState<SubSectorWithRelations[] | undefined>([]);

  useEffect(() => {
    if (!isInventoryDataLoading) {
      const unfinishedSubSectors = inventoryData?.sectorProgress.flatMap(
        (sector) =>
          sector.subSectors.filter((subsector) => !subsector.completed),
      );

      setUnfinishedSubsectorsData(unfinishedSubSectors);
    }
  }, [inventoryData, isInventoryDataLoading, inventoryDataError]);
  console.log(unfinishedSubsectorsData);
  if (isInventoryDataLoading) {
    return <Box>Loading...</Box>;
  }

  const renderSectorTabList = () => {
    return inventoryData?.sectorProgress.map(({ sector }) => {
      return (
        <Tabs.Trigger
          key={sector.sectorId}
          value={`tab-${sector.sectorId}`}
          _selected={{
            color: "content.link",
            fontWeight: "bold",
            fontFamily: "heading",
          }}
        >
          <Text fontSize="title.md" truncate>
            {sector.sectorName}
          </Text>
        </Tabs.Trigger>
      );
    });
  };

  const renderSectorTabContent = () =>
    inventoryData?.sectorProgress.map(({ sector, subSectors }) => {
      // Filter to get only unfinished subsectors
      const unfinishedSubsectors = subSectors.filter(
        (subsector) => !subsector.completed,
      );
      return (
        <Tabs.Content key={sector.sectorId} value={`tab-${sector.sectorId}`}>
          <Text fontSize="title.md" mb={2}>
            {sector.sectorName}
          </Text>
          {unfinishedSubsectors.length > 0 ? (
            unfinishedSubsectors.map((subsector) => (
              <Box key={subsector.subsectorId} mb={2}>
                <Text>{subsector.subsectorName}</Text>
              </Box>
            ))
          ) : (
            <Text>No unfinished subsectors.</Text>
          )}
        </Tabs.Content>
      );
    });

  console.log(inventoryData);
  return (
    <Tabs.Root
      lazyMount
      unmountOnExit
      defaultValue={`tab-${inventoryData?.sectorProgress[0].sector.sectorId}`}
    >
      <Tabs.List>{renderSectorTabList()}</Tabs.List>
      {renderSectorTabContent()}
    </Tabs.Root>
  );
};

export default SectorTabs;
