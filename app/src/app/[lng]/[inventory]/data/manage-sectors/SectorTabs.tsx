import { InventoryProgressResponse } from "@/util/types";
import { Box, Tabs, Text } from "@chakra-ui/react";
import { SerializedError } from "@reduxjs/toolkit";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { TFunction } from "i18next";
import React, { FC } from "react";

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
    inventoryData?.sectorProgress.map(({ sector }) => {
      return (
        <Tabs.Content key={sector.sectorId} value={`tab-${sector.sectorId}`}>
          {sector.sectorName}
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
