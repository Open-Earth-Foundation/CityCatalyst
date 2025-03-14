import { InventoryProgressResponse } from "@/util/types";
import {
  Box,
  Card,
  CheckboxCard,
  createListCollection,
  Field,
  Icon,
  Input,
  ProgressCircle,
  Tabs,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { SerializedError } from "@reduxjs/toolkit";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { TFunction } from "i18next";
import React, { FC, useEffect } from "react";
import { SubSectorWithRelations } from "../[step]/types";
import { StationaryEnergyIcon } from "@/components/icons";
import { BiSelectMultiple } from "react-icons/bi";

import { MdInfoOutline } from "react-icons/md";
import { RiErrorWarningFill } from "react-icons/ri";

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
  // State to track selected subsector IDs per sector (keyed by sector ID)
  const [selectedCardsBySector, setSelectedCardsBySector] = React.useState<
    Record<string, string[]>
  >({}); // State to track selected subsector IDs per sector (keyed by sector ID)

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
    return (
      <Box
        height="40vh"
        w="100%"
        display="flex"
        justifyContent="center"
        alignItems="center"
      >
        <ProgressCircle.Root value={null} size="sm">
          <ProgressCircle.Circle>
            <ProgressCircle.Track />
            <ProgressCircle.Range />
          </ProgressCircle.Circle>
        </ProgressCircle.Root>
      </Box>
    );
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

      const selectedForThisSector =
        selectedCardsBySector[sector.sectorId] || [];

      const handleToggleCard = (subSectorId: string) => {
        setSelectedCardsBySector((prev) => ({
          ...prev,
          [sector.sectorId]: prev[sector.sectorId]?.includes(subSectorId)
            ? prev[sector.sectorId].filter((id) => id !== subSectorId)
            : [...(prev[sector.sectorId] || []), subSectorId],
        }));
      };

      // Toggle select all for the current sector
      const handleSelectAll = () => {
        if (selectedForThisSector.length === unfinishedSubsectors.length) {
          // All are selected so unselect all
          setSelectedCardsBySector((prev) => ({
            ...prev,
            [sector.sectorId]: [],
          }));
        } else {
          // Select all unfinished subsectors
          setSelectedCardsBySector((prev) => ({
            ...prev,
            [sector.sectorId]: unfinishedSubsectors.map((s) => s.subsectorId),
          }));
        }
      };

      return (
        <Tabs.Content
          key={sector.sectorId}
          value={`tab-${sector.sectorId}`}
          pt="70px"
          _open={{
            animationName: "fade-in, scale-in",
            animationDuration: "300ms",
          }}
          _closed={{
            animationName: "fade-out, scale-out",
            animationDuration: "120ms",
          }}
          inset="0"
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
              {/* Select All button */}
              <Button variant="ghost" onClick={handleSelectAll}>
                <Icon as={BiSelectMultiple} color="content.link" boxSize={6} />
                <Text
                  fontWeight="bold"
                  fontFamily="heading"
                  color="content.link"
                >
                  {t("quick-actions")}
                </Text>
              </Button>
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

          {/* unfinished subsectors cards */}
          {unfinishedSubsectors.length > 0 ? (
            <>
              <Box
                display="grid"
                gridTemplateColumns="repeat(auto-fill, minmax(450px, 1fr))"
                gap="48px"
              >
                {unfinishedSubsectors.map((subsector) => (
                  <CheckboxCard.Root
                    width="497px"
                    key={subsector.subsectorId}
                    height="344px"
                    p={0}
                    borderCollapse="border.neutral"
                    checked={selectedForThisSector.includes(
                      subsector.subsectorId,
                    )}
                    onCheckedChange={() =>
                      handleToggleCard(subsector.subsectorId)
                    }
                  >
                    <CheckboxCard.HiddenInput />
                    <CheckboxCard.Control>
                      <CheckboxCard.Content>
                        <CheckboxCard.Label my="24px">
                          <Icon
                            as={RiErrorWarningFill}
                            boxSize={5}
                            color="sentiment.warningDefault"
                          />
                          <Text
                            fontSize="title.md"
                            fontFamily="heading"
                            fontWeight="bold"
                          >
                            {" "}
                            {t(subsector.referenceNumber!)} {""}
                            {t(subsector.subsectorName!)}
                          </Text>
                        </CheckboxCard.Label>
                        <CheckboxCard.Description w="full">
                          <Box
                            mb="48px"
                            display="flex"
                            flexDirection="column"
                            gap="32px"
                            w="full"
                          >
                            <Box
                              display="flex"
                              flexDir="column"
                              gap="16px"
                              w="full"
                            >
                              <Field.Root orientation="vertical" w="ull">
                                <SelectRoot
                                  variant="outline"
                                  collection={notationKeys}
                                  w="full"
                                >
                                  <SelectLabel
                                    display="flex"
                                    alignItems="center"
                                    gap="8px"
                                  >
                                    <Text
                                      fontFamily="heading"
                                      color="content.secondary"
                                    >
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
                                      placeholder={t(
                                        "notation-key-input-placeholder",
                                      )}
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
                                  <Text
                                    fontFamily="heading"
                                    color="content.secondary"
                                  >
                                    {t("explanation")}
                                  </Text>
                                </Field.Label>

                                <Textarea
                                  placeholder={t(
                                    "explanation-input-placeholder",
                                  )}
                                  borderWidth="1px"
                                  borderColor="border.neutral"
                                  borderRadius="md"
                                  shadow="1dp"
                                  height="96px"
                                />
                                <Field.ErrorText>
                                  This is an error text
                                </Field.ErrorText>
                              </Field.Root>
                            </Box>
                          </Box>
                        </CheckboxCard.Description>
                      </CheckboxCard.Content>
                      <CheckboxCard.Indicator />
                    </CheckboxCard.Control>
                  </CheckboxCard.Root>
                ))}
              </Box>
              <Box
                py="48px"
                display="flex"
                justifyContent="flex-end"
                gap="16px"
              >
                <Button height="56px" width="150px" variant="outline">
                  {t("cancel")}
                </Button>
                <Button height="56px" width="150px" variant="solid">
                  {t("update")}
                </Button>
              </Box>
            </>
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
