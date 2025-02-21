import { EmissionsForecastData } from "@/util/types";
import type { TFunction } from "i18next";
import {
  getReferenceNumberByName,
  getSectorByName,
  getSectorByReferenceNumber,
  getSubSectorByName,
  getSubSectorByReferenceNumber,
  ISector,
} from "@/util/constants";
import { Box, Card, Heading, HStack, Table, Text } from "@chakra-ui/react";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import { ResponsiveLine } from "@nivo/line";
import CustomLegend from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/CustomLegend";
import { ColoredCircle } from "@/components/ColoredCircle";
import { ButtonSmall } from "@/components/Texts/Button";
import { TitleMedium } from "@/components/Texts/Title";

interface LineChartData {
  id: string;
  color: string;
  data: { x: string; y: number }[];
}

export const getColorForSeries = (seriesId: string) => {
  const sectorOrSubsector =
    getSectorByName(seriesId) || getSubSectorByName(seriesId);
  return sectorOrSubsector?.color || "semantic.dangerOverlay";
};

export const EmissionsForecastChart = ({
  forecast,
  t,
}: {
  forecast: EmissionsForecastData;
  t: TFunction;
}) => {
  const convertToLineChartData = (
    forecastData: EmissionsForecastData,
  ): LineChartData[] => {
    const sectors = Object.keys(
      forecastData.forecast[Object.keys(forecastData.forecast)[0]],
    );
    return sectors
      .map((sector) => {
        const [sectorRefNo, subSectorRefNo] = sector.split(".");

        return {
          id: !subSectorRefNo
            ? getSectorByReferenceNumber(sectorRefNo)?.name || sector
            : getSubSectorByReferenceNumber(sector)?.name || sector,
          color: getColorForSeries(sector),
          data: Object.entries(forecastData.forecast).map(
            ([year, sectorsData]) => {
              return {
                x: year,
                y: sectorsData[sector] || 0,
              };
            },
          ),
        };
      })
      .reverse();
  };

  const data = convertToLineChartData(forecast);
  const colors = data.map((series) => getColorForSeries(series.id)!);

  return (
    <>
      <Box width="100%" height="70vh">
        <ResponsiveLine
          data={data}
          margin={{ top: 50, right: 30, bottom: 50, left: 80 }}
          xScale={{ type: "point" }}
          yScale={{
            type: "linear",
            min: 0,
            max: "auto",
            stacked: true,
          }}
          curve="natural"
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            format: (value) => (parseInt(value) % 5 === 0 ? value : ""),
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            format: (value: number) => convertKgToTonnes(value),
          }}
          colors={colors}
          tooltip={({ point }) => {
            const year = point.data.x;
            const sumOfYs = data.reduce((sum, series) => {
              const yearData = series.data.find(({ x }) => x === year);
              return sum + parseInt((yearData?.y as unknown as string) || "0");
            }, 0);

            return (
              <Card.Root py={2} px={2}>
                <Box padding="4" borderBottom="1px solid">
                  <Heading size="sm">{t("year")}</Heading>
                  <Text
                    fontFamily="heading"
                    fontSize="label.lg"
                    fontStyle="normal"
                    lineHeight="20px"
                    letterSpacing="wide"
                  >
                    {year as unknown as string}
                  </Text>
                </Box>
                <Box padding="4">
                  <Table.Root size={"sm"}>
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>
                          <ButtonSmall>{t("sector").toUpperCase()}</ButtonSmall>
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          <ButtonSmall>{t("rate").toUpperCase()}</ButtonSmall>
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          <ButtonSmall>%</ButtonSmall>
                        </Table.ColumnHeader>
                        <Table.ColumnHeader>
                          <ButtonSmall>
                            {t("total-emissions").toUpperCase()}
                          </ButtonSmall>
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {data.map(({ data, id }) => {
                        const yearData = data.find(
                          ({ x }) => x === point.data.x,
                        );
                        const percentage = yearData
                          ? ((yearData.y / sumOfYs) * 100).toFixed(2)
                          : 0;
                        const sectorRefNo =
                          getReferenceNumberByName(
                            toKebabCase(id as string) as keyof ISector,
                          ) || getSubSectorByName(id)?.referenceNumber;

                        const yearGrowthRates =
                          yearData &&
                          forecast.growthRates[yearData.x as string];
                        const growthRate =
                          yearGrowthRates?.[sectorRefNo!] ||
                          yearGrowthRates?.[point.serieId as string];

                        return (
                          <Table.Row key={id}>
                            <Table.Cell>
                              <HStack>
                                <ColoredCircle
                                  size="10px"
                                  color={getColorForSeries(id)}
                                />
                                {t(id)}
                              </HStack>
                            </Table.Cell>
                            <Table.Cell>{growthRate}</Table.Cell>
                            <Table.Cell>{percentage}%</Table.Cell>
                            <Table.Cell>
                              {convertKgToTonnes(
                                parseInt(yearData?.y as unknown as string),
                              )}
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                      <Table.Row>
                        <Table.ColumnHeader>
                          <TitleMedium>{t("total").toUpperCase()}</TitleMedium>
                        </Table.ColumnHeader>
                        <Table.ColumnHeader></Table.ColumnHeader>
                        <Table.ColumnHeader>
                          <TitleMedium>
                            {convertKgToTonnes(sumOfYs)}
                          </TitleMedium>
                        </Table.ColumnHeader>
                      </Table.Row>
                    </Table.Body>
                  </Table.Root>
                </Box>
              </Card.Root>
            );
          }}
          enableGridX={false}
          enableGridY={false}
          enablePoints={false}
          pointSize={10}
          pointColor={{ theme: "background" }}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          pointLabel="data.yFormatted"
          pointLabelYOffset={-12}
          enableArea={true}
          areaOpacity={1}
          enableTouchCrosshair={true}
          useMesh={true}
        />
      </Box>
      <CustomLegend data={data} t={t} />
    </>
  );
};
