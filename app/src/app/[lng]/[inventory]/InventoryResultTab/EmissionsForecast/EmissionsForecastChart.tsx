import { EmissionsForecastData } from "@/util/types";
import { TFunction } from "i18next/typescript/t";
import { getReferenceNumberByName, SECTORS, ISector } from "@/util/constants";
import {
  Badge,
  Box,
  Card,
  Heading,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Tr,
} from "@chakra-ui/react";
import { ResponsiveLine } from "@nivo/line";
import { convertKgToTonnes } from "@/util/helpers";

interface LineChartData {
  id: string;
  data: { x: string; y: number }[];
}

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
      .map((sector) => ({
        id: t(
          SECTORS.find((s) => s.referenceNumber === sector)?.name + "-short" ||
            sector,
        ),
        data: Object.entries(forecastData.forecast).map(
          ([year, sectorsData]) => {
            return {
              x: year,
              y: sectorsData[sector] || 0,
            };
          },
        ),
      }))
      .reverse();
  };

  const data = convertToLineChartData(forecast);

  const colors = ["#FFAB51", "#5162FF", "#51ABFF", "#D45252", "#CFAE53"];
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
                <Tbody>
                  {data.map((series, index) => {
                    const yearData = series.data.find(
                      ({ x }) => x === point.data.x,
                    );
                    const percentage = yearData
                      ? ((yearData.y / sumOfYs) * 100).toFixed(2)
                      : 0;
                    const sectorRefNo = getReferenceNumberByName(
                      point.serieId as keyof ISector,
                    );

                    return (
                      <Tr key={series.id}>
                        <Td>
                          <Badge
                            colorScheme="gray"
                            boxSize="10px"
                            bg={colors[index]}
                            marginRight="8px"
                          />
                          {series.id}
                        </Td>
                        <Td>
                          {
                            forecast.growthRates[point.data.x as number]?.[
                              sectorRefNo!
                            ]
                          }
                        </Td>
                        <Td>{percentage}%</Td>
                        <Td>
                          {convertKgToTonnes(
                            parseInt(yearData?.y as unknown as string),
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                  <Tr>
                    <Th>{t("total")}</Th>
                    <Th></Th>
                    <Th>{convertKgToTonnes(sumOfYs)}</Th>
                  </Tr>
                </Tbody>
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
        },
      ]}
    />
  );
};
