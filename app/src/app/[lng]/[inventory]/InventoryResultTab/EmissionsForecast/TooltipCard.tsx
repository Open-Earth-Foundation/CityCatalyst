import React from "react";
import { Box, Text } from "@chakra-ui/react";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import {
  getReferenceNumberByName,
  getSubSectorByName,
  ISector,
} from "@/util/constants";
import { getColorForSeries } from "./EmissionsForecastChart";
import type { TFunction } from "i18next";
import { EmissionsForecastData } from "@/util/types";
import type { Point, LineSeries } from "@nivo/line";

interface LineChartData {
  id: string;
  color: string;
  data: { x: string; y: number }[];
}

interface TooltipCardProps {
  point: Point<LineSeries>;
  data: LineChartData[];
  forecast: EmissionsForecastData;
  t: TFunction;
}

const TooltipCard = ({ point, data, forecast, t }: TooltipCardProps) => {
  console.log("Rendering TooltipCard for point:", point);
  const year = point.data.x;
  const sumOfYs = data.reduce((sum, series) => {
    const yearData = series.data.find(({ x }) => x === year);
    return sum + parseInt((yearData?.y as unknown as string) || "0");
  }, 0);

  return (
    <Box
      backgroundColor="white"
      borderRadius="8px"
      boxShadow="2dp"
      minW="420px"
      data-testid="tooltip-card-forecast"
    >
        <Box>
          <Box
            py={3}
            px={4}
            borderBottom="1px solid"
            borderColor="border.overlay"
          >
            <Text
              fontSize="title.sm"
              fontWeight="600"
              color="content.secondary"
            >
              {year as unknown as string}
            </Text>
            <Text fontSize="label.sm" fontWeight="500" color="content.tertiary">
              {t("emissions-forecast")}
            </Text>
          </Box>
          <Box
            py={3}
            px={4}
            display="flex"
            flexDirection="column"
            gap={2.5}
            mt={2}
          >
            {data
              .filter((series) => {
                const yearData = series.data.find(({ x }) => x === year);
                return yearData && yearData.y !== 0;
              })
              .map((series) => {
                const yearData = series.data.find(({ x }) => x === year);
                const percentage = yearData
                  ? ((yearData.y / sumOfYs) * 100).toFixed(2)
                  : 0;
                const sectorRefNo =
                  getReferenceNumberByName(
                    toKebabCase(series.id as string) as keyof ISector,
                  ) || getSubSectorByName(series.id)?.referenceNumber;

                const yearGrowthRates =
                  yearData && forecast.growthRates[yearData.x as string];
                const growthRate =
                  yearGrowthRates?.[sectorRefNo!] ||
                  yearGrowthRates?.[point.seriesId as string];

                return (
                  <Box
                    key={series.id}
                    display="flex"
                    flexDirection="row"
                    alignItems="center"
                    gap={2}
                    justifyContent="space-between"
                  >
                    <Box display="flex" alignItems="center" gap={2}>
                      <Box boxSize="4" bgColor={getColorForSeries(series.id)}></Box>
                      <Text
                        fontSize="body.md"
                        textAlign="left"
                        flex={1}
                        color="content.secondary"
                      >
                        {t(series.id)}
                      </Text>
                    </Box>
                    <Box display="flex" justifyContent="flex-end" gap={4}>
                      <Text
                        fontSize="body.md"
                        px={2}
                        textAlign="right"
                        color="content.primary"
                      >
                        {percentage}%
                      </Text>
                      <Text
                        fontSize="body.md"
                        textAlign="right"
                        color="content.primary"
                      >
                        {convertKgToTonnes(
                          parseInt(yearData?.y as unknown as string) || 0,
                        )}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
          </Box>
          <Box
            mt={2}
            display="flex"
            justifyContent="space-between"
            py={3}
            px={4}
            borderTop="1px solid"
            borderColor="border.overlay"
            alignItems="center"
          >
            <Text
              fontSize="body.md"
              fontWeight="600"
              textAlign="left"
              textTransform="capitalize"
              color="content.primary"
            >
              {t("total")}
            </Text>
            <Text
              fontSize="body.md"
              fontWeight="600"
              textAlign="right"
              color="content.primary"
            >
              {convertKgToTonnes(sumOfYs)}
            </Text>
          </Box>
        </Box>
    </Box>
  );
};

export default TooltipCard;
