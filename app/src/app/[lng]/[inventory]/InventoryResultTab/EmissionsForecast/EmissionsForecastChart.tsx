import React from "react";
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
import { TooltipProvider, useCustomTooltip } from "./CustomTooltipContext";

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

function CustomTooltipLayer(props: any) {
  const {
    innerWidth,
    innerHeight,
    xScale,
    yScale,
    series,
    data,
    forecast,
    t,
  } = props;

  // Get all unique x values (years) from all series
  const allXValues = series[0]?.data?.map((d: any) => d.data.x) || [];
  const sliceWidth = innerWidth / Math.max(allXValues.length - 1, 1);

  const { showTooltipFromEvent, hideTooltip } = useCustomTooltip();

  return (
    <g>
      {allXValues.map((xValue: any, index: number) => {
        const x = xScale(xValue) ?? 0;
        const sliceX = index === 0 ? 0 : x - sliceWidth / 2;
        const width =
          index === 0 || index === allXValues.length - 1
            ? sliceWidth / 2
            : sliceWidth;

        const handleMouseMove = (event: React.MouseEvent) => {
          // Find the first series' point at this x position to use as the primary point
          const primaryPoint = series[0]?.data?.find(
            (d: any) => d.data.x === xValue,
          );

          if (!primaryPoint) return;

          const tooltipData = {
            point: {
              ...primaryPoint,
              x: xScale(xValue) ?? 0,
              y: yScale(primaryPoint.data.y) ?? 0,
              data: primaryPoint.data,
              seriesId: series[0]?.id,
            },
            data,
            forecast,
            t,
          };

          showTooltipFromEvent(
            <TooltipCard {...tooltipData} />,
            event,
            "right"
          );
        };

        const handleMouseLeave = () => {
          hideTooltip();
        };

        return (
          <rect
            key={xValue}
            x={sliceX}
            y={0}
            width={width}
            height={innerHeight}
            fill="transparent"
            style={{ pointerEvents: "all" }}
            onMouseEnter={handleMouseMove}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        );
      })}
    </g>
  );
}

const EmissionsForecastChartInner = ({
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
      <Box width="100%" height="500px">
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
          isInteractive={false}
          layers={[
            "grid",
            "markers",
            "axes",
            "areas",
            "crosshair",
            "lines",
            "points",
            "slices",
            "mesh",
            "legends",
            (layerProps) =>
              CustomTooltipLayer({
                ...layerProps,
                data,
                forecast,
                t,
              }),
          ]}
        />
      </Box>
      <CustomLegend data={data} t={t} />
    </>
  );
};

export const EmissionsForecastChart = ({
  forecast,
  t,
}: {
  forecast: EmissionsForecastData;
  t: TFunction;
}) => {
  return (
    <TooltipProvider>
      <EmissionsForecastChartInner forecast={forecast} t={t} />
    </TooltipProvider>
  );
};
