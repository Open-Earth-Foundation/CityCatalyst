"use client";

import { useTranslation } from "@/i18n/client";
import { InventoryResponse } from "@/util/types";
import {
  Box,
  Card,
  CircularProgress,
  Divider,
  Heading,
  HStack,
  Icon,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TabHeader } from "@/components/HomePage/TabHeader";
import EmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsWidget";
import TopEmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/TopEmissionsWidget";
import { BlueSubtitle } from "@/components/blue-subtitle";
import { PopulationAttributes } from "@/models/Population";
import type { TFunction } from "i18next";
import { capitalizeFirstLetter, toKebabCase } from "@/util/helpers";
import React, { ChangeEvent, useState } from "react";
import { api } from "@/services/api";
import ByScopeView from "@/app/[lng]/[inventory]/InventoryResultTab/ByScopeView";
import { SectorHeader } from "@/app/[lng]/[inventory]/InventoryResultTab/SectorHeader";
import { ByActivityView } from "@/app/[lng]/[inventory]/InventoryResultTab/ByActivityView";
import { getSectorsForInventory, SECTORS } from "@/util/constants";
import { Selector } from "@/components/selector";
import { EmptyStateCardContent } from "@/app/[lng]/[inventory]/InventoryResultTab/EmptyStateCardContent";
import { Trans } from "react-i18next/TransWithoutContext";

enum TableView {
  BY_ACTIVITY = "by-activity",
  BY_SCOPE = "by-scope",
}

function SectorTabs({
  t,
  inventory,
  lng,
  isPublic,
}: {
  t: TFunction;
  inventory: InventoryResponse;
  lng: string;
  isPublic: boolean;
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
      sector: SECTORS[selectedIndex].name,
    });

  const handleViewChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedTableView(event.target.value as TableView);
  };

  const isEmptyInventory =
    Object.entries(sectorBreakdown?.byActivity || {}).length === 0;

  return (
    <Tabs
      align="start"
      variant="line"
      index={selectedIndex}
      onChange={(index) => setSelectedIndex(index)}
    >
      <TabList>
        {getSectorsForInventory(inventory?.inventoryType).map(
          ({ icon, name }, index) => (
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
                {capitalizeFirstLetter(t(name))}
              </Text>
            </Tab>
          ),
        )}
      </TabList>

      <TabPanels>
        {SECTORS.map(({ icon, name }) => {
          const shouldShowTableByActivity =
            !isEmptyInventory &&
            !isResultsLoading &&
            selectedTableView === TableView.BY_ACTIVITY;
          const shouldShowTableByScope =
            !isEmptyInventory &&
            !isResultsLoading &&
            selectedTableView === TableView.BY_SCOPE;
          return (
            <TabPanel key={name}>
              {isTopEmissionsResponseLoading ? (
                <CircularProgress isIndeterminate />
              ) : (
                <Card>
                  <SectorHeader
                    icon={icon}
                    sectorName={t(name)}
                    dataForSector={getDataForSector(name)}
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
                    <Box paddingBottom={"12px"}>
                      <Selector
                        options={[TableView.BY_ACTIVITY, TableView.BY_SCOPE]}
                        value={selectedTableView}
                        onChange={handleViewChange}
                        t={t}
                      />
                    </Box>
                  </HStack>
                  {isResultsLoading && <CircularProgress isIndeterminate />}
                  {isEmptyInventory && (
                    <EmptyStateCardContent
                      t={t}
                      inventoryId={inventory.inventoryId}
                      width={"1042px"}
                      height={"592px"}
                      isPublic={isPublic}
                    />
                  )}
                  {shouldShowTableByActivity && (
                    <ByActivityView
                      sectorBreakdown={sectorBreakdown!}
                      tData={tData}
                      tDashboard={t}
                      sectorName={name}
                    />
                  )}
                  {shouldShowTableByScope && (
                    <ByScopeView
                      data={sectorBreakdown!.byScope}
                      tData={tData}
                      tDashboard={t}
                      sectorName={name}
                    />
                  )}
                </Card>
              )}
            </TabPanel>
          );
        })}
      </TabPanels>
    </Tabs>
  );
}

function EmissionsBreakdown({
  t,
  inventory,
  lng,
  isPublic,
}: {
  t: TFunction;
  inventory: InventoryResponse;
  lng: string;
  isPublic: boolean;
}) {
  return (
    <>
      <BlueSubtitle t={t} text={"sector-data"} />
      <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
        <Trans
          i18nKey="sector-emissions-in"
          values={{ year: inventory?.year }}
          t={t}
        />
      </Heading>
      <Text
        fontWeight="regular"
        fontSize="body.lg"
        color="interactive.control"
        letterSpacing="wide"
      >
        {t("view-total-emissions-data-by-GPC-required-sectors")}
      </Text>
      <SectorTabs t={t} inventory={inventory} lng={lng} isPublic={isPublic} />
    </>
  );
}

export default function InventoryResultTab({
  lng,
  inventory,
  isPublic,
  population,
}: {
  lng: string;
  inventory?: InventoryResponse;
  population?: PopulationAttributes;
  isPublic: boolean;
}) {
  const { t } = useTranslation(lng, "dashboard");
  return (
    <>
      {inventory && (
        <Box className="flex flex-col gap-[8px] w-full">
          <TabHeader
            t={t}
            inventory={inventory}
            title={"tab-emission-inventory-results-title"}
            isPublic={isPublic}
          />
          <BlueSubtitle t={t} text={"overview"} />
          <Heading fontSize="headline.sm" fontWeight="semibold" lineHeight="32">
            <Trans
              i18nKey="total-emissions-in"
              values={{ year: inventory?.year }}
              t={t}
            ></Trans>
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
            <TopEmissionsWidget
              t={t}
              inventory={inventory}
              isPublic={isPublic}
            />
          </HStack>
          <EmissionsBreakdown
            t={t}
            inventory={inventory}
            lng={lng}
            isPublic={isPublic}
          />
        </Box>
      )}
    </>
  );
}
