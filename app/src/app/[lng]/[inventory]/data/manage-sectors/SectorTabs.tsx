import { InventoryProgressResponse } from "@/util/types";
import {
  Box,
  createListCollection,
  Field,
  Icon,
  Input,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { SerializedError } from "@reduxjs/toolkit";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { TFunction } from "i18next";
import React, { FC, useEffect } from "react";
import { SubSectorWithRelations } from "../[step]/types";
import { BuildingIcon, StationaryEnergyIcon } from "@/components/icons";
import { BiSelectMultiple } from "react-icons/bi";
import { BsInfoCircle } from "react-icons/bs";
import { FaInfoCircle } from "react-icons/fa";
import { MdInfoOutline } from "react-icons/md";
import {
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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

  // notation keys collection
  const notationKeys = createListCollection({
    items: [
      {
        label: t("ne"),
        value: "ne",
      },
      {
        label: t("na"),
        value: "notation-key-2",
      },
      {
        label: t("no"),
        value: "notation-key-3",
      },
      {
        label: t("ie"),
        value: "ie",
      },
      {
        label: t("c"),
        value: "c",
      },
    ],
  });

  const renderSectorTabContent = () =>
    inventoryData?.sectorProgress.map(({ sector, subSectors }) => {
      // Filter to get only unfinished subsectors
      const unfinishedSubsectors = subSectors.filter(
        (subsector) => !subsector.completed,
      );
      return (
        <Tabs.Content
          key={sector.sectorId}
          value={`tab-${sector.sectorId}`}
          pt="70px"
        >
          {/* Heading */}
          <Box mb="48px" display="flex" flexDirection="column" gap="16px">
            <Box display="flex" alignItems="center" gap="16px">
              <Icon as={StationaryEnergyIcon} color="interactive.control" />
              <Text fontSize="title.lg" fontFamily="heading" fontWeight="bold">
                {sector.sectorName}
              </Text>
            </Box>
            <Text fontSize="body.lg" fontFamily="body" color="content.tertiary">
              {t("content-description")}
            </Text>
          </Box>
          {/* Quick Action form */}
          <Box mb="48px" display="flex" flexDirection="column" gap="32px">
            <Box display="flex" alignItems="center" gap="8px">
              <Icon as={BiSelectMultiple} color="content.link" boxSize={6} />
              <Text fontWeight="bold" fontFamily="heading" color="content.link">
                {t("quick-actions")}
              </Text>
            </Box>
            <Box display="flex" gap="16px" alignItems="end">
              <Field.Root orientation="vertical">
                <SelectRoot variant="outline" collection={notationKeys}>
                  <SelectLabel display="flex" alignItems="center" gap="8px">
                    <Text fontFamily="heading" color="content.secondary">
                      {t("notation-key")}
                    </Text>
                    <Icon
                      as={MdInfoOutline}
                      color="interactive.control"
                      boxSize={4}
                    />
                  </SelectLabel>
                  <SelectTrigger
                    borderWidth="1px"
                    borderColor="border.neutral"
                    borderRadius="md"
                  >
                    <SelectValueText
                      color="content.tertiary"
                      fontWeight="medium"
                      placeholder={t("notation-key-input-placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {notationKeys.items.map((key) => (
                      <SelectItem item={key} key={key.value}>
                        {key.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              </Field.Root>
              <Field.Root orientation="vertical">
                <Field.Label>
                  <Text fontFamily="heading" color="content.secondary">
                    {t("explanation")}
                  </Text>
                </Field.Label>

                <Input
                  placeholder={t("explanation-input-placeholder")}
                  borderWidth="1px"
                  borderColor="border.neutral"
                  borderRadius="md"
                  shadow="1dp"
                />
                <Field.ErrorText>This is an error text</Field.ErrorText>
              </Field.Root>
              <Button variant="ghost" color="content.link">
                {t("apply-to-all")}
              </Button>
            </Box>
          </Box>

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
