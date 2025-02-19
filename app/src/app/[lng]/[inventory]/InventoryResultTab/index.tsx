"use client";
import { useTranslation } from "@/i18n/client";
import { CityYearData, InventoryResponse, SectorEmission } from "@/util/types";
import {
  Box,
  Card,
  CardHeader,
  Heading,
  HStack,
  Icon,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { TabHeader } from "@/components/HomePage/TabHeader";
import EmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsWidget";
import TopEmissionsWidget from "@/app/[lng]/[inventory]/InventoryResultTab/TopEmissionsWidget";
import { BlueSubtitle } from "@/components/Texts/BlueSubtitle";
import { PopulationAttributes } from "@/models/Population";
import type { TFunction } from "i18next";
import { isEmptyObject, toKebabCase } from "@/util/helpers";
import React, {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  useGetCityYearsQuery,
  useGetYearOverYearResultsQuery,
} from "@/services/api";
import ByScopeView from "@/app/[lng]/[inventory]/InventoryResultTab/ByScopeView";
import { SectorHeader } from "@/app/[lng]/[inventory]/InventoryResultTab/SectorHeader";
import { ByActivityView } from "@/app/[lng]/[inventory]/InventoryResultTab/ByActivityView";
import { getSectorsForInventory, SECTORS } from "@/util/constants";
import { EmptyStateCardContent } from "@/app/[lng]/[inventory]/InventoryResultTab/EmptyStateCardContent";
import { Trans } from "react-i18next/TransWithoutContext";
import ButtonGroupToggle from "@/components/button-group-toggle";
import { MdBarChart, MdTableChart } from "react-icons/md";
import EmissionBySectorTableSection from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionBySectorTable";
import EmissionBySectorChart from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionBySectorChart";
import { EmissionsForecastSection } from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/EmissionsForecastSection";
import { toaster } from "@/components/ui/toaster";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import { TooltipProvider } from "@nivo/tooltip";

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
  const [isLoadingNewData, setIsLoadingNewData] = useState(false);
  const getDataForSector = (sectorName: string) =>
    results?.totalEmissions.bySector.find(
      (e) =>
        toKebabCase(e.sectorName).toLowerCase() === toKebabCase(sectorName),
    );

  const { data: results, isLoading: isTopEmissionsResponseLoading } =
    api.useGetResultsQuery(inventory!.inventoryId!);

  const {
    data: sectorBreakdown,
    isLoading: isResultsLoading,
    error,
    refetch,
  } = api.useGetSectorBreakdownQuery({
    inventoryId: inventory!.inventoryId!,
    sector: SECTORS[selectedIndex].name,
  });

  const makeErrorToast = (title: string, description?: string) => {
    toaster.create({
      title,
      description,
      type: "error",
      duration: 10000,
    });
  };

  if (error) {
    makeErrorToast(t("something-went-wrong"), t("error-fetching-sector-data"));
    console.error("Error fetching sector breakdown:", error);
  }

  useEffect(() => {
    setIsLoadingNewData(true);
    refetch().finally(() => setIsLoadingNewData(false));
  }, [selectedIndex, refetch]);

  const handleViewChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedTableView(event.target.value as TableView);
  };

  const isEmptyInventory =
    Object.entries(sectorBreakdown?.byActivity || {}).length === 0 &&
    Object.entries(sectorBreakdown?.byScope || {}).length === 0;

  return (
    <Tabs.Root
      // align="start"
      variant="line"
      defaultValue={SECTORS[0].name}
      // index={selectedIndex}
      // onChange={(index) => setSelectedIndex(index)}
    >
      <Tabs.List>
        {getSectorsForInventory(inventory?.inventoryType).map(
          ({ icon, name }, index) => (
            <Tabs.Trigger key={index} value={name}>
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
                {t(name)}
              </Text>
            </Tabs.Trigger>
          ),
        )}
      </Tabs.List>

      {SECTORS.map(({ icon, name }) => {
        const shouldShowTableByActivity =
          !isEmptyInventory &&
          !isResultsLoading &&
          false && // ON-3126 restore view by activity
          selectedTableView === TableView.BY_ACTIVITY;
        const shouldShowTableByScope =
          !isEmptyInventory &&
          inventory &&
          !isResultsLoading &&
          !isLoadingNewData; // &&
        // selectedTableView === TableView.BY_SCOPE; ON-3126 restore view by activity
        return (
          <Tabs.Content value={name} key={name}>
            {isTopEmissionsResponseLoading ? (
              <ProgressCircleRoot>
                <ProgressCircleRing cap="round" />
              </ProgressCircleRoot>
            ) : (
              <Card.Root divideX="2px" divideColor="border.overlay">
                <SectorHeader
                  icon={icon}
                  sectorName={t(name)}
                  dataForSector={getDataForSector(name)}
                  t={t}
                />
                <HStack justifyContent="space-between" width="100%">
                  <Text
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="medium"
                  >
                    {t("breakdown-of-sub-sector-emissions")}
                  </Text>
                  {/*<Box paddingBottom={"12px"}>
                      <Selector
                        options={[TableView.BY_ACTIVITY, TableView.BY_SCOPE]}
                        value={selectedTableView}
                        onChange={handleViewChange}
                        t={t}
                      />
                    </Box>
                    {***[ON-3126 restore view by activity]*/}
                </HStack>
                {(isResultsLoading || isLoadingNewData) && (
                  <ProgressCircleRoot>
                    <ProgressCircleRing cap="round" />
                  </ProgressCircleRoot>
                )}
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
                    inventoryType={inventory.inventoryType}
                    data={sectorBreakdown!.byScope}
                    tData={tData}
                    tDashboard={t}
                    sectorName={name}
                  />
                )}
              </Card.Root>
            )}
          </Tabs.Content>
        );
      })}
    </Tabs.Root>
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

  const { data: cityYears, isLoading } = useGetCityYearsQuery(
    inventory?.cityId,
  );

  const loadingState = isLoading || isLoadingYearlgyGhg;

  const targetYears = useMemo<
    Record<string, { year: number; inventoryId: string; lastUpdate: Date }>
  >(() => {
    return (
      cityYears?.years.reduce(
        (acc: Record<string, CityYearData>, curr: CityYearData) => {
          acc[curr.inventoryId] = curr;
          return acc;
        },
        {} as Record<string, any>,
      ) ?? {}
    );
  }, [cityYears]);

  const transformedYearOverYearData = useMemo(() => {
    if (yearlyGhgResult && targetYears && !isEmptyObject(targetYears)) {
      const yearlyMap: Record<string, SectorEmission[]> = {};
      const totalInventoryEmissions: Record<string, bigint> = {};
      const response = Object.keys(yearlyGhgResult)
        .map((inventoryId) => {
          const year = targetYears[inventoryId]?.year;
          if (!year) {
            console.error("Target year missing for inventory " + inventoryId);
            return null;
          }
          const totalEmissions = yearlyGhgResult[inventoryId].totalEmissions;
          yearlyMap[year] = totalEmissions.totalEmissionsBySector;
          totalInventoryEmissions[year] = BigInt(totalEmissions.sumOfEmissions);

          return {
            bySector: [...totalEmissions.totalEmissionsBySector],
            year,
            inventoryId,
          };
        })
        .filter((data) => !!data);

      // taking the response object let's working on getting the percentage increase for each year
      return response
        .map((data) => {
          const yearWithPercentageIncrease = data.bySector.map((sectorData) => {
            const inventoryEmissions = totalInventoryEmissions[data.year];
            if (!inventoryEmissions) {
              console.error(
                "Total inventory emissions missing for year " + data.year,
              );
            }

            const totalInventoryPercentage = inventoryEmissions
              ? Number((BigInt(sectorData.co2eq) * 100n) / inventoryEmissions)
              : null;

            let percentageChange: number | null = null;
            if (data.year - 1 in yearlyMap) {
              const lastYearData = yearlyMap[data.year - 1].find(
                (sector) => sector.sectorName === sectorData.sectorName,
              );

              if (lastYearData) {
                const sectorAmount = BigInt(sectorData.co2eq);
                const lastYearDifference =
                  sectorAmount - BigInt(lastYearData.co2eq);
                percentageChange = Number(
                  (lastYearDifference * 100n) / sectorAmount,
                );
              }
            }

            return {
              ...sectorData,
              percentageChange,
              totalInventoryPercentage,
            };
          });

          return {
            ...data,
            bySector: yearWithPercentageIncrease,
          };
        })
        .filter((data) => !!data)
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

  let containerRef = useRef<HTMLDivElement>(document.createElement("div"));

  return (
    <Box className="flex flex-col gap-[8px] w-full">
      <Card.Root paddingY="16px" paddingX="24px">
        <Box className="flex items-center justify-between">
          <Card.Header padding={0}>
            <Heading size="sm">{t("ghg-by-sector-heading")}</Heading>
          </Card.Header>
          <ButtonGroupToggle options={options} activeOption={selectedView} />
        </Box>
        {loadingState && (
          <Box className="w-full py-12 flex items-center justify-center">
            <ProgressCircleRoot>
              <ProgressCircleRing cap="round" />
            </ProgressCircleRoot>
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
                <TooltipProvider container={containerRef}>
                  <div className="min-h-[600px]" ref={containerRef}>
                    <EmissionBySectorChart
                      data={transformedYearOverYearData}
                      lng={lng}
                    />
                  </div>
                </TooltipProvider>
              )}
            </Box>
          )
        }
      </Card.Root>
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
          <EmissionsForecastSection
            inventoryId={inventory.inventoryId}
            t={t}
            lng={lng}
          />
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
