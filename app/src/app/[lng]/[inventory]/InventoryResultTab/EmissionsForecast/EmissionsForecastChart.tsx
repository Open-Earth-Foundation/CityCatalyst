import { EmissionsForecastData } from "@/util/types";
import { TFunction } from "i18next/typescript/t";
import {
  getReferenceNumberByName,
  getSectorByName,
  getSectorByReferenceNumber,
  getSubSectorByName,
  getSubSectorByReferenceNumber,
  ISector,
} from "@/util/constants";
import {
  Badge,
  Box,
  Card,
  Heading,
  Table,
  Tbody,
  Td,
  Text,
  Tfoot,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import { ResponsiveLine } from "@nivo/line";

interface LineChartData {
  id: string;
  color: string;
  data: { x: string; y: number }[];
}

const getColorForSeries = (seriesId: string) => {
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
    <ResponsiveLine
      data={data}
      margin={{ top: 50, right: 30, bottom: 100, left: 80 }}
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
          <Card py={2} px={2}>
            <Box padding="4" borderBottom="1px solid">
              <Heading size="title.sm">{t("year")}</Heading>
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
              <Table variant="simple" size={"sm"}>
                <Thead>
                  <Tr>
                    <Th>{t("sector")}</Th>
                    <Th>{t("rate")}</Th>
                    <Th>%</Th>
                    <Th>{t("total-emissions")}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.map(({ data, id }) => {
                    const yearData = data.find(({ x }) => x === point.data.x);
                    const percentage = yearData
                      ? ((yearData.y / sumOfYs) * 100).toFixed(2)
                      : 0;
                    const sectorRefNo =
                      getReferenceNumberByName(
                        toKebabCase(id as string) as keyof ISector,
                      ) || getSubSectorByName(id)?.referenceNumber;

                    const yearGrowthRates =
                      yearData && forecast.growthRates[yearData.x as string];
                    const growthRate =
                      yearGrowthRates?.[sectorRefNo!] ||
                      yearGrowthRates?.[point.serieId as string];

                    return (
                      <Tr key={id}>
                        <Td>
                          <Badge
                            boxSize="10px"
                            bg={getColorForSeries(id)}
                            marginRight="8px"
                          />
                          {t(id)}
                        </Td>
                        <Td>{growthRate}</Td>
                        <Td>{percentage}%</Td>
                        <Td>
                          {convertKgToTonnes(
                            parseInt(yearData?.y as unknown as string),
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
                <Tfoot>
                  <Tr>
                    <Th>{t("total")}</Th>
                    <Th></Th>
                    <Th></Th>
                    <Th>{convertKgToTonnes(sumOfYs)}</Th>
                  </Tr>
                </Tfoot>
              </Table>
            </Box>
          </Card>
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
      legends={[
        {
          anchor: "bottom",
          direction: "row",
          justify: false,
          translateX: 0,
          translateY: 60,
          itemWidth: 140,
          itemHeight: 20,
          itemsSpacing: 4,
          symbolSize: 20,
          symbolShape: "circle",
          itemDirection: "left-to-right",
          itemTextColor: "#777",
          effects: [
            {
              on: "hover",
              style: {
                itemBackground: "rgba(0, 0, 0, .03)",
                itemOpacity: 1,
              },
            },
          ],
          data: data.map((series) => ({
            id: series.id,
            color: getColorForSeries(series.id),
            label: t(series.id),
          })),
        },
      ]}
    />
  );
};
