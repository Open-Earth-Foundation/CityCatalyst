"use client";

import { useTranslation } from "@/i18n/client";
import { InventoryResponse, SectorEmission } from "@/util/types";
import {
  Box,
  Card,
  CardHeader,
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
import React, { ChangeEvent, useMemo, useState } from "react";
import {
  api,
  useGetCitiesAndYearsQuery,
  useGetYearOverYearResultsQuery,
} from "@/services/api";
import ByScopeView from "@/app/[lng]/[inventory]/InventoryResultTab/ByScopeView";
import { SectorHeader } from "@/app/[lng]/[inventory]/InventoryResultTab/SectorHeader";
import { ByActivityView } from "@/app/[lng]/[inventory]/InventoryResultTab/ByActivityView";
import { getSectorsForInventory, SECTORS } from "@/util/constants";
import { Selector } from "@/components/selector";
import { EmptyStateCardContent } from "@/app/[lng]/[inventory]/InventoryResultTab/EmptyStateCardContent";
import { Trans } from "react-i18next/TransWithoutContext";
import ButtonGroupToggle from "@/components/button-group-toggle";
import { MdBarChart, MdTableChart } from "react-icons/md";
import EmissionBySectorTableSection from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionBySectorTable";
import EmissionBySectorChart from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionBySectorChart";

enum TableView {
  BY_ACTIVITY = "by-activity",
  BY_SCOPE = "by-scope",
}

export const toKebabCaseModified = (str: string) => {
  if (str.toLowerCase().includes("ippu")) {
    return "ippu";
  } else if (str.toLowerCase().includes("afolu")) {
    return "afolu";
  }
  return toKebabCase(str);
};

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

export function EmissionPerSectors({
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
  const [selectedView, setSelectedView] = useState("table");

  const { data: yearlyGhgResult, isLoading: isLoadingYearlgyGhg } =
    useGetYearOverYearResultsQuery(inventory?.cityId!, {
      skip: !inventory?.cityId,
    });

  const { data: citiesAndYears, isLoading } = useGetCitiesAndYearsQuery();

  const loadingState = isLoading || isLoadingYearlgyGhg;

  const targetYears = useMemo<
    | Record<string, { year: number; inventoryId: string; lastUpdate: Date }>
    | undefined
  >(() => {
    return citiesAndYears
      ?.find(({ city }) => inventory.cityId === city.cityId)
      ?.years.reduce(
        (acc, curr) => {
          acc[curr.inventoryId] = curr;
          return acc;
        },
        {} as Record<string, any>,
      );
  }, [citiesAndYears, inventory]);

  const transformedYearOverYearData = useMemo(() => {
    if (yearlyGhgResult && targetYears) {
      const yearlyMap: Record<string, SectorEmission[]> = {};
      const response = Object.keys(yearlyGhgResult).map((inventoryId) => {
        const yearData = targetYears[inventoryId];
        yearlyMap[yearData.year] =
          yearlyGhgResult[inventoryId].totalEmissions.totalEmissionsBySector;
        return {
          bySector: [
            ...yearlyGhgResult[inventoryId].totalEmissions
              .totalEmissionsBySector,
          ],
          ...yearData,
        };
      });

      // taking the response object let's working on getting the percentage increase for each year
      return response
        .map((data) => {
          const yearWithPercentageIncrease = data.bySector.map((sectorData) => {
            if (data.year - 1 in yearlyMap) {
              let lastYearData = yearlyMap[data.year - 1].find(
                (sector) => sector.sectorName === sectorData.sectorName,
              );

              // calculate percentage change

              let percentageChange = lastYearData
                ? Number(
                    (BigInt(sectorData.co2eq) - BigInt(lastYearData?.co2eq)) *
                      100n,
                  ) / Number(sectorData.co2eq)
                : 100;

              return {
                ...sectorData,
                percentageChange,
              };
            }
            return {
              ...sectorData,
              percentageChange: 0n,
            };
          });
          return {
            ...data,
            bySector: yearWithPercentageIncrease,
          };
        })
        .sort((a, b) => b.year - a.year);
    }
    return [];
  }, [targetYears, yearlyGhgResult]);

  const options = [
    {
      label: t("table-view"),
      value: "table",
      onClick: () => setSelectedView("table"),
      icon: MdTableChart,
    },
    {
      label: t("chart-view"),
      value: "chart",
      onClick: () => setSelectedView("chart"),
      icon: MdBarChart,
    },
  ];

  return (
    <Box className="flex flex-col gap-[8px] w-full">
      <Card paddingY="16px" paddingX="24px">
        <Box className="flex items-center justify-between">
          <CardHeader padding={0}>
            <Heading size="sm">{t("ghg-by-sector-heading")}</Heading>
          </CardHeader>
          <ButtonGroupToggle options={options} activeOption={selectedView} />
        </Box>
        {loadingState && (
          <Box className="w-full py-12 flex items-center justify-center">
            <CircularProgress isIndeterminate />
          </Box>
        )}
        {!loadingState && transformedYearOverYearData.length === 0 && (
          <EmptyStateCardContent
            t={t}
            inventoryId={inventory.inventoryId}
            width={"1042px"}
            height={"592px"}
            isPublic={isPublic}
          />
        )}
        {
          // if we have data, we can display the table or the chart
          !loadingState && transformedYearOverYearData.length > 0 && (
            <Box className="pt-6">
              {selectedView === "table" ? (
                <EmissionBySectorTableSection
                  lng={lng}
                  data={transformedYearOverYearData}
                />
              ) : (
                <EmissionBySectorChart
                  data={transformedYearOverYearData}
                  lng={lng}
                />
              )}
            </Box>
          )
        }
      </Card>
    </Box>
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
          <EmissionPerSectors
            t={t}
            inventory={inventory}
            lng={lng}
            isPublic={isPublic}
          />
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
