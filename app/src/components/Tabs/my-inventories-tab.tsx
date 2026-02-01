"use client";

import {
  Box,
  Icon,
  IconButton,
  Input,
  List,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Table,
  Tabs,
  Text,
} from "@chakra-ui/react";
import {
  AccordionRoot,
  AccordionItem,
  AccordionItemTrigger,
  AccordionItemContent,
} from "@/components/ui/accordion";
import { InputGroup } from "@/components/ui/input-group";
import React, { FC, useEffect, useMemo, useState } from "react";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";

import {
  MdMoreVert,
  MdOutlineFileDownload,
  MdOutlineFolder,
  MdSearch,
} from "react-icons/md";
import { Toaster, toaster } from "@/components/ui/toaster";
import { logger } from "@/services/logger";

import type { TFunction } from "i18next";
import type { CityAttributes } from "@/models/City";
import { api } from "@/services/api";
import type { InventoryAttributes } from "@/models/Inventory";
import { CircleFlag } from "react-circle-flags";
import SettingsSkeleton from "../Skeletons/settings-skeleton";
import { clamp } from "@/util/helpers";

// Component to fetch and display inventory progress
const InventoryProgressCell: FC<{ inventoryId: string }> = ({ inventoryId }) => {
  const { data: inventoryProgress, isLoading } =
    api.useGetInventoryProgressQuery(inventoryId);

  const totalProgress = useMemo(() => {
    if (inventoryProgress && inventoryProgress.totalProgress.total > 0) {
      const { uploaded, thirdParty, total } = inventoryProgress.totalProgress;
      return Math.round(clamp((uploaded + thirdParty) / total) * 100);
    }
    return 0;
  }, [inventoryProgress]);

  return (
    <Box display="flex" alignItems="center" gap="12px">
      <Box
        w="137px"
        h="8px"
        bg="background.neutral"
        borderRadius="8px"
        overflow="hidden"
      >
        <Box
          h="100%"
          w={`${isLoading ? 0 : totalProgress}%`}
          bg="interactive.tertiary"
          borderRadius="8px"
          transition="width 0.3s ease"
        />
      </Box>
      <Text
        fontSize="body.md"
        fontWeight="medium"
        color="content.secondary"
        minW="40px"
      >
        {isLoading ? "-" : `${totalProgress}%`}
      </Text>
    </Box>
  );
};

interface MyInventoriesTabProps {
  t: TFunction;
  lng: string;
  cities: CityAttributes[] | any;
  projects?: any;
  defaultCityId?: string;
}

const MyInventoriesTab: FC<MyInventoriesTabProps> = ({
  t,
  lng,
  cities,
  projects,
  defaultCityId,
}) => {
  // Create a lookup map for project names
  const projectNameMap = useMemo(() => {
    if (!projects) return {};
    return projects.reduce((acc: any, project: any) => {
      acc[project.projectId] = project.name;
      return acc;
    }, {});
  }, [projects]);

  const [cityId, setCityId] = useState<string | undefined>(defaultCityId);
  const [searchTerm, setSearchTerm] = useState("");

  // Use fuzzy search hook for filtering cities
  const filteredCities = useFuzzySearch<CityAttributes>({
    data: cities || [],
    keys: ["name", "country", "region"],
    searchTerm,
    threshold: 0.3,
  });

  // Auto-expand all projects with matching cities when searching
  const expandedProjects = useMemo(() => {
    if (!searchTerm || !filteredCities) return [];

    const projectIds = new Set<string>();
    filteredCities.forEach((city) => {
      if (city.projectId) {
        projectIds.add(city.projectId);
      } else {
        projectIds.add("no-project");
      }
    });
    return Array.from(projectIds);
  }, [searchTerm, filteredCities]);

  useEffect(() => {
    if (!cityId && defaultCityId && defaultCityId !== cityId) {
      setCityId(defaultCityId);
    }
  }, [defaultCityId, cityId]);

  const { data: inventories } = api.useGetInventoriesQuery(
    { cityId: cityId! },
    { skip: !cityId },
  );

  // Handle CSV download for an inventory
  const handleDownloadCSV = (inventoryId: string) => {
    toaster.create({
      description: t("preparing-download"),
      type: "info",
      duration: 3000,
    });

    fetch(`/api/v1/inventory/${inventoryId}/download?format=csv&lng=${lng}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Network response was not ok");
        }

        const contentDisposition = res.headers.get("Content-Disposition");
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          const filename = match ? match[1] : `inventory_${inventoryId}.csv`;
          return res.blob().then((blob) => {
            const downloadLink = document.createElement("a");
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = filename;
            downloadLink.click();

            toaster.create({
              description: t("download-success"),
              type: "success",
              duration: 3000,
            });

            URL.revokeObjectURL(downloadLink.href);
            downloadLink.remove();
          });
        }
      })
      .catch((error) => {
        logger.error({ err: error, inventoryId }, "Failed to download inventory CSV");
        toaster.create({
          description: t("download-failed"),
          type: "error",
          duration: 3000,
        });
      });
  };

  // Converts the lastUpdated string to a Date object and returns a formatted date
  function InventoryLastUpdated(lastUpdated: Date) {
    if (!lastUpdated) {
      return <p>{t("no-date-available")}</p>;
    }

    // Convert the string to a Date object
    const date = new Date(lastUpdated);

    // If date is invalid (e.g., `new Date('Invalid')`), handle that
    if (isNaN(date.getTime())) {
      return <p>{t("invalid-date")}</p>;
    }

    return <p>{date.toLocaleDateString()}</p>;
  }

  return (
    <>
      <Tabs.Content value="my-inventories">
        <Box display="flex" flexDirection="column" gap="48px" marginTop="32px">
          <Box>
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="32"
              fontSize="headline.sm"
              fontFamily="heading"
              fontStyle="normal"
            >
              {t("my-inventories")}
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
              fontSize="body.lg"
              letterSpacing="wide"
              marginTop="8px"
            >
              {t("my-inventories-sub-title")}
            </Text>
          </Box>

          <Box display="flex" flexDirection="row" gap="36px">
            {/* Left: Projects with Cities */}
            <Box
              minW="260px"
              maxW="320px"
              display="flex"
              flexDirection="column"
            >
              <Text
                color="content.secondary"
                fontWeight="semibold"
                lineHeight="24"
                fontSize="title.md"
                letterSpacing="wide"
                marginBottom="16px"
                fontFamily="heading"
              >
                {t("projects")}
              </Text>

              {/* Search Bar */}
              <Box mb="16px">
                <InputGroup
                  w="full"
                  height="48px"
                  shadow="1dp"
                  alignItems="center"
                  display="flex"
                  borderRadius="4px"
                  borderWidth="1px"
                  borderStyle="solid"
                  borderColor="border.neutral"
                  startElement={
                    <Icon
                      as={MdSearch}
                      color="content.tertiary"
                      display="flex"
                      pointerEvents="none"
                      alignItems="center"
                      size="md"
                    />
                  }
                >
                  <Input
                    type="search"
                    fontSize="body.md"
                    fontFamily="heading"
                    letterSpacing="wide"
                    color="content.tertiary"
                    placeholder={t("search-by-city-or-country")}
                    border="none"
                    h="100%"
                    onChange={(e) => setSearchTerm(e.target.value)}
                    value={searchTerm}
                  />
                </InputGroup>
              </Box>

              {filteredCities && filteredCities.length > 0 ? (
                <Box maxHeight="600px" overflowY="auto">
                  <AccordionRoot
                    collapsible
                    multiple
                    value={searchTerm ? expandedProjects : undefined}
                  >
                    {Object.entries(
                      filteredCities.reduce(
                        (acc: any, city: CityAttributes) => {
                          const projectId = city.projectId || "no-project";
                          if (!acc[projectId]) acc[projectId] = [];
                          acc[projectId].push(city);
                          return acc;
                        },
                        {},
                      ),
                    ).map(([projectId, projectCities]: [string, any]) => (
                      <AccordionItem key={projectId} value={projectId}>
                        <AccordionItemTrigger>
                          <Text fontWeight="semibold" fontSize="label.lg">
                            {projectNameMap[projectId] ?? t("no-project")}
                          </Text>
                        </AccordionItemTrigger>
                        <AccordionItemContent>
                          <Box
                            display="flex"
                            flexDirection="column"
                            gap="8px"
                            pl="8px"
                          >
                            {projectCities.map((city: CityAttributes) => (
                              <Box
                                key={city.cityId}
                                cursor="pointer"
                                py="8px"
                                px="12px"
                                onClick={() => setCityId(city.cityId)}
                                bg={
                                  cityId === city.cityId
                                    ? "background.neutral"
                                    : "transparent"
                                }
                                borderRadius="8px"
                                borderWidth={
                                  cityId === city.cityId ? "1px" : "0"
                                }
                                borderStyle="solid"
                                borderColor={
                                  cityId === city.cityId
                                    ? "content.link"
                                    : "transparent"
                                }
                                color={
                                  cityId === city.cityId
                                    ? "content.link"
                                    : "content.secondary"
                                }
                                _hover={{
                                  backgroundColor: "background.neutral",
                                }}
                              >
                                <Box
                                  display="flex"
                                  alignItems="center"
                                  gap="8px"
                                >
                                  <CircleFlag
                                    countryCode={
                                      city.countryLocode
                                        ?.substring(0, 2)
                                        ?.toLowerCase() ||
                                      city.locode
                                        ?.substring(0, 2)
                                        ?.toLowerCase() ||
                                      city.regionLocode
                                        ?.substring(0, 2)
                                        ?.toLowerCase() ||
                                      ""
                                    }
                                    height="24px"
                                    width="24px"
                                  />
                                  <Text fontWeight="medium" fontSize="label.lg">
                                    {city.name}
                                  </Text>
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        </AccordionItemContent>
                      </AccordionItem>
                    ))}
                  </AccordionRoot>
                </Box>
              ) : (
                <SettingsSkeleton />
              )}
            </Box>

            {/* Right: Inventories Table for selected city */}
            <Box flex={1}>
              {cityId && (
                <Tabs.Root
                  display="flex"
                  flexDirection="column"
                  gap="24px"
                  defaultValue={cities?.[0]?.cityId}
                >
                  {/* City Header */}
                  <Box>
                    <Box display="flex" gap="8px" alignItems="center">
                      <CircleFlag
                        countryCode={
                          cities
                            ?.find((c: CityAttributes) => c.cityId === cityId)
                            ?.countryLocode?.substring(0, 2)
                            ?.toLowerCase() ||
                          cities
                            ?.find((c: CityAttributes) => c.cityId === cityId)
                            ?.locode?.substring(0, 2)
                            ?.toLowerCase() ||
                          cities
                            ?.find((c: CityAttributes) => c.cityId === cityId)
                            ?.regionLocode?.substring(0, 2)
                            ?.toLowerCase() ||
                          ""
                        }
                        height="32px"
                        width="32px"
                      />
                      <Text
                        color="content.secondary"
                        fontWeight="semibold"
                        lineHeight="24"
                        fontSize="title.md"
                        fontFamily="heading"
                        fontStyle="normal"
                      >
                        {
                          cities?.find(
                            (c: CityAttributes) => c.cityId === cityId,
                          )?.name
                        }
                      </Text>
                    </Box>
                  </Box>

                  <Box display="flex">
                    <Text
                      color="content.tertiary"
                      fontWeight="bold"
                      lineHeight="24"
                      fontSize="body.lg"
                      letterSpacing="widest"
                      textTransform="uppercase"
                    >
                      {t("all-inventory-years")}
                    </Text>
                  </Box>
                  <Box display="flex" flexDirection="column" gap="24px">
                    <Table.Root
                      variant="outline"
                      borderStyle="solid"
                      w="783px"
                      borderWidth="1px"
                      borderColor="border.overlay"
                      borderRadius="12px"
                    >
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeader />
                          <Table.ColumnHeader>
                            {t("inventory-year")}
                          </Table.ColumnHeader>
                          <Table.ColumnHeader>{t("status")}</Table.ColumnHeader>
                          <Table.ColumnHeader align="right">
                            {t("last-updated")}
                          </Table.ColumnHeader>
                          <Table.ColumnHeader align="right">
                            {""}
                          </Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body
                        fontFamily="heading"
                        color="content.primary"
                        fontSize="body.md"
                      >
                        {inventories?.map((inventory: InventoryAttributes) => (
                          <Table.Row key={inventory.inventoryId}>
                            <Table.Cell>
                              <Box color="content.tertiary">
                                <MdOutlineFolder size={24} />
                              </Box>
                            </Table.Cell>
                            <Table.Cell>
                              <Text>{inventory.year}</Text>
                            </Table.Cell>
                            <Table.Cell>
                              <InventoryProgressCell
                                inventoryId={inventory.inventoryId}
                              />
                            </Table.Cell>
                            {/* TODO remove hardcoded date https://openearth.atlassian.net/browse/ON-3350 */}
                            <Table.Cell align="right">
                              {InventoryLastUpdated(inventory.lastUpdated!)}
                            </Table.Cell>
                            <Table.Cell align="right">
                              <Popover.Root lazyMount>
                                <PopoverTrigger>
                                  <IconButton
                                    aria-label="action-button"
                                    variant="ghost"
                                    color="interactive.control"
                                    height="36px"
                                    width="36px"
                                  >
                                    <Icon as={MdMoreVert} boxSize={6} />
                                  </IconButton>
                                </PopoverTrigger>
                                <PopoverContent
                                  h="64px"
                                  w="260px"
                                  borderRadius="8px"
                                  shadow="2dp"
                                  borderWidth="1px"
                                  borderStyle="solid"
                                  borderColor="border.neutral"
                                  padding="10px"
                                  px="0"
                                  pos="absolute"
                                >
                                  <PopoverBody padding="0">
                                    <List.Root padding="0">
                                      <List.Item
                                        display="flex"
                                        cursor="pointer"
                                        gap="16px"
                                        color="content.tertiary"
                                        alignItems="center"
                                        px="16px"
                                        paddingTop="12px"
                                        paddingBottom="12px"
                                        _hover={{
                                          background: "content.link",
                                          color: "white",
                                        }}
                                        onClick={() =>
                                          handleDownloadCSV(inventory.inventoryId)
                                        }
                                      >
                                        <MdOutlineFileDownload size={24} />
                                        <Text
                                          color="content.secondary"
                                          fontFamily="heading"
                                          letterSpacing="wide"
                                          fontWeight="normal"
                                          fontSize="body.lg"
                                          _groupHover={{ color: "white" }}
                                        >
                                          {t("download-csv")}
                                        </Text>
                                      </List.Item>
                                    </List.Root>
                                  </PopoverBody>
                                </PopoverContent>
                              </Popover.Root>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  </Box>
                </Tabs.Root>
              )}
            </Box>
          </Box>
        </Box>
      </Tabs.Content>
      <Toaster />
    </>
  );
};

export default MyInventoriesTab;
