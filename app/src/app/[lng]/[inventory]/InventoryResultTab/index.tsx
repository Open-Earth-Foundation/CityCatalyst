"use client";

import { useTranslation } from "@/i18n/client";
import { InventoryProgressResponse, InventoryResponse } from "@/util/types";
import {
  Box,
  Card,
  CircularProgress,
  Divider,
  Heading,
  HStack,
  Icon,
  Select,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TabHeader } from "@/app/[lng]/[inventory]/TabHeader";
import EmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsWidget";
import TopEmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/TopEmissionsWidget";
import { BlueSubtitle } from "@/components/blue-subtitle";
import { PopulationAttributes } from "@/models/Population";
import type { TFunction } from "i18next";
import { SECTORS } from "@/app/sectors";
import { capitalizeFirstLetter, toKebabCase } from "@/util/helpers";
import React, { ChangeEvent, useState } from "react";
import { api } from "@/services/api";
import ByScopeView from "@/app/[lng]/[inventory]/InventoryResultTab/ByScopeView";
import { SectorHeader } from "@/app/[lng]/[inventory]/InventoryResultTab/SectorHeader";
import { ByActivityView } from "@/app/[lng]/[inventory]/InventoryResultTab/ByActivityView";
import { EmptyStateCardContent } from "@/app/[lng]/[inventory]/InventoryResultTab/EmptyStateCardContent";

enum TableView {
  BY_ACTIVITY = "by-activity",
  BY_SCOPE = "by-scope",
}

function SectorTabs({
  t,
  inventory,
  lng,
}: {
  t: TFunction;
  inventory: InventoryResponse;
  lng: string;
}) {
  const { t: tData } = useTranslation(lng, "data");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTableView, setSelectedTableView] = useState<TableView>(
    TableView.BY_ACTIVITY,
  );
  const getDataForSector = (sectorName: string) =>
    results?.totalEmissions.bySector.find(
      (e) =>
        toKebabCase(e.sectorName).toLowerCase() === toKebabCase(sectorName),
    );

  const { data: results, isLoading: isTopEmissionsResponseLoading } =
    api.useGetResultsQuery(inventory!.inventoryId!);

  const { data: sectorBreakdown, isLoading: isResultsLoading } =
    api.useGetSectorBreakdownQuery({
      inventoryId: inventory!.inventoryId!,
      sector: SECTORS[selectedIndex].sectorName,
    });

  const handleViewChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedTableView(event.target.value as TableView);
  };

  const isEmptyInventory =
    Object.entries(sectorBreakdown?.byActivity || {}).length === 0;
  const selectStyles = {
    fontFamily: "Poppins",
    fontSize: "button.md",
    fontWeight: 600,
    lineHeight: "16px",
    letterSpacing: "1.25px",
    textTransform: "uppercase",
  };

  return (
    <Tabs
      align="start"
      variant="line"
      index={selectedIndex}
      onChange={(index) => setSelectedIndex(index)}
    >
      <TabList>
        {SECTORS.map(({ icon, sectorName }, index) => (
          <Tab key={index}>
            <Icon
              as={icon}
              height="24px"
              w="24px"
              color={
                selectedIndex === index ? "content.link" : "content.tertiary"
              }
            />
            <Text
              fontSize="16"
              mx="16px"
              fontWeight={selectedIndex === index ? 600 : 400}
              fontStyle="normal"
              color={
                selectedIndex === index ? "content.link" : "content.tertiary"
              }
            >
              {capitalizeFirstLetter(t(sectorName))}
            </Text>
          </Tab>
        ))}
      </TabList>

      <TabPanels>
        {SECTORS.map(({ icon, sectorName }) => (
          <TabPanel key={sectorName}>
            {isTopEmissionsResponseLoading ? (
              <CircularProgress isIndeterminate />
            ) : (
              <Card>
                <SectorHeader
                  icon={icon}
                  sectorName={t(sectorName)}
                  dataForSector={getDataForSector(sectorName)}
                  t={t}
                />
                <Divider
                  borderColor="border.overlay"
                  borderWidth="1px"
                  my={"24px"}
                />
                <HStack justifyContent="space-between" width="100%">
                  <Text
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="medium"
                  >
                    {t("breakdown-of-sub-sector-emissions")}
                  </Text>
                  (
                  <Box paddingBottom={"12px"}>
                    <Select
                      width="162px"
                      value={selectedTableView}
                      onChange={handleViewChange}
                      sx={{
                        ...selectStyles,
                        "& option": {
                          ...selectStyles,
                          textAlign: "left",
                          padding: "8px",
                        },
                      }}
                    >
                      {[TableView.BY_ACTIVITY, TableView.BY_SCOPE].map(
                        (opt) => (
                          <option key={opt} value={opt}>
                            {t(opt)}
                          </option>
                        ),
                      )}
                    </Select>
                  </Box>
                  )
                </HStack>
                {isResultsLoading && <CircularProgress isIndeterminate />}
                {isEmptyInventory && (
                  <EmptyStateCardContent
                    t={t}
                    inventoryId={inventory.inventoryId}
                    width={"1042px"}
                    height={"592px"}
                  />
                )}
                {!isEmptyInventory &&
                  !isResultsLoading &&
                  selectedTableView === TableView.BY_ACTIVITY && (
                    <ByActivityView
                      sectorBreakdown={sectorBreakdown!}
                      tData={tData}
                      tDashboard={t}
                      sectorName={sectorName}
                    />
                  )}
                {!isEmptyInventory &&
                  !isResultsLoading &&
                  selectedTableView === TableView.BY_SCOPE && (
                    <ByScopeView
                      data={sectorBreakdown!.byScope}
                      tData={tData}
                      tDashboard={t}
                      sectorName={sectorName}
                    />
                  )}
              </Card>
            )}
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
}

function EmissionsBreakdown({
  t,
  inventory,
  lng,
}: {
  t: TFunction;
  inventory: InventoryResponse;
  lng: string;
}) {
  return (
    <>
      <BlueSubtitle t={t} text={"sector-data"} />
      <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
        {t("Sector emissions in {{year}}", { year: inventory?.year })}
      </Heading>
      <Text
        fontWeight="regular"
        fontSize="body.lg"
        color="interactive.control"
        letterSpacing="wide"
      >
        {t("view-total-emissions-data-by-GPC-required-sectors")}
      </Text>
      <SectorTabs t={t} inventory={inventory} lng={lng} />
    </>
  );
}

export default function InventoryResultTab({
  lng,
  inventory,
  isUserInfoLoading,
  isInventoryProgressLoading,
  inventoryProgress,
  population,
}: {
  lng: string;
  inventory?: InventoryResponse;
  isUserInfoLoading?: boolean;
  isInventoryProgressLoading?: boolean;
  inventoryProgress?: InventoryProgressResponse;
  population?: PopulationAttributes;
}) {
  const { t } = useTranslation(lng, "dashboard");
  return (
    <>
      {inventory && (
        <Box className="flex flex-col gap-[8px] w-full">
          <TabHeader
            t={t}
            year={inventory?.year}
            title={"tab-emission-inventory-results-title"}
          />
          <BlueSubtitle t={t} text={"overview"} />
          <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
            {t("Total Emissions in {{year}}", { year: inventory?.year })}
          </Heading>
          <Text
            fontWeight="regular"
            fontSize="body.lg"
            color="interactive.control"
            letterSpacing="wide"
          >
            {t("see-your-citys-emissions")}
          </Text>
          <HStack my={4} alignItems={"start"}>
            <EmissionsWidget
              t={t}
              inventory={inventory}
              population={population}
            />
            <TopEmissionsWidget t={t} inventory={inventory} />
          </HStack>
          <EmissionsBreakdown t={t} inventory={inventory} lng={lng} />
        </Box>
      )}
    </>
  );
}
