import { EmissionsForecastData } from "@/util/types";
import type { TFunction } from "i18next";
import {
  getSectorByName,
  getSectorByReferenceNumber,
  getSubSectorByName,
  getSubSectorByReferenceNumber,
} from "@/util/constants";
import { Box } from "@chakra-ui/react";
import { convertKgToTonnes } from "@/util/helpers";
import { ResponsiveLine } from "@nivo/line";
import CustomLegend from "@/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/CustomLegend";
import TooltipCard from "./TooltipCard";

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
          tooltip={({ point }) => (
            <TooltipCard point={point} data={data} forecast={forecast} t={t} />
          )}
          enableSlices="x"
          sliceTooltip={({ slice }) => (
            <TooltipCard
              point={slice.points[0]}
              data={data}
              forecast={forecast}
              t={t}
            />
          )}
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
