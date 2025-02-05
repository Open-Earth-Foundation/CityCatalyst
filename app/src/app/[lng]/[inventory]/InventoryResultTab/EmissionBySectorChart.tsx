import { SectorEmission } from "@/util/types";
import { BarCustomLayerProps, ResponsiveBar } from "@nivo/bar";
import { allSectorColors, SECTORS } from "@/util/constants";
import { convertKgToTonnes } from "@/util/helpers";
import { useTranslation } from "@/i18n/client";
import { toKebabCaseModified } from "@/app/[lng]/[inventory]/InventoryResultTab/index";
import { Box, Text } from "@chakra-ui/react";
import { useTooltip } from "@nivo/tooltip";
import { useMemo, useState } from "react";

interface EmissionBySectorChartProps {
  data: {
    bySector: SectorEmission[];
    year: number;
    inventoryId: string;
  }[];
  lng: string;
}

interface CustomBar {
  absX: number;
  absY: number;
  color: string;
  height: number;
  width: number;
  index: number;
  key: string;
  label: string;
  x: number;
  y: number;
  data: {
    formattedValue: string;
    hidden: boolean;
    id: string;
    index: number;
    indexValue: number;
    value: number;
    data: Record<string, any>;
  };
}

const createRoundedTopRectPath = ({
  x,
  y,
  width,
  height,
  radius,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}) => {
  const r = Math.min(radius, width / 2, height);
  return `
    M ${x + r} ${y}
    L ${x + width - r} ${y}
    A ${r} ${r} 0 0 1 ${x + width} ${y + r}
    L ${x + width} ${y + height}
    L ${x} ${y + height}
    L ${x} ${y + r}
    A ${r} ${r} 0 0 1 ${x + r} ${y}
    Z
  `;
};

export interface CombinedPoint {
  x: number;
  y: number;
  data: {
    total: number;
    year: string;
    segments: Array<{
      id: string;
      value: number;
      color: string;
      percentage: number;
    }>;
  };
}

export interface CustomCombinedBarLayerProps<D> extends BarCustomLayerProps<D> {
  customTooltip: (point: CombinedPoint) => React.ReactNode;
}

function CustomCombinedBarLayer<D>({
  bars,
  customTooltip,
}: CustomCombinedBarLayerProps<D>) {
  const { showTooltipFromEvent, hideTooltip } = useTooltip();
  const [focusedBar, setFocusedBar] = useState<string>();

  const barsByYear: Record<string, CustomBar[]> = useMemo(
    () =>
      bars.reduce((acc: any, bar: any) => {
        const year = bar.data.indexValue;
        if (!acc[year]) {
          acc[year] = [];
        }
        acc[year].push(bar);
        return acc;
      }, {}),
    [bars],
  );

  return (
    <g>
      {Object.entries(barsByYear).map(([year, bars]) => {
        const yTop = Math.min(...bars.map((bar: any) => bar.y));
        const yBottom = Math.max(...bars.map((bar: any) => bar.y + bar.height));
        const height = yBottom - yTop;

        bars.sort((a, b) => a.y - b.y);
        const topSegment = bars[0];

        const totalEmission = bars.reduce(
          (acc, bar) => acc + bar.data.value,
          0,
        );
        // Create a combined point for the tooltip.
        const combinedPoint: CombinedPoint = {
          x: topSegment.x + topSegment.width / 2,
          y: topSegment.y,
          data: {
            year,
            total: totalEmission,
            segments: bars.map((bar) => ({
              id: bar.data.id,
              // Assuming each segment’s value is stored with key === bar.id
              value: bar.data.value as number,
              color: bar.color,
              percentage: (bar.data.value / totalEmission) * 100,
            })),
          },
        };

        // Mouse event handlers (using the provided functions)
        const handleMouseEnter = (e: React.MouseEvent) => {
          setFocusedBar(combinedPoint.data.year);
          showTooltipFromEvent(
            customTooltip(combinedPoint) as React.ReactElement,
            e,
            "right",
          );
        };
        const handleMouseMove = (e: React.MouseEvent) => {
          setFocusedBar(combinedPoint.data.year);
          showTooltipFromEvent(
            customTooltip(combinedPoint) as React.ReactElement,
            e,
            "right",
          );
        };
        const handleMouseLeave = () => {
          setFocusedBar(undefined);
          hideTooltip();
        };

        const roundedTopPath = createRoundedTopRectPath({
          x: topSegment.x,
          y: topSegment.y,
          width: topSegment.width,
          height: topSegment.height,
          radius: 16,
        });
        return (
          <g key={year}>
            {bars
              .filter((bar) => bar.index !== topSegment.index)
              .map((bar: any, index) => {
                return (
                  <rect
                    key={bar.data.id}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    fill={bar.color}
                    stroke={bar.borderColor}
                    strokeWidth={bar.borderWidth}
                  />
                );
              })}
            <path
              d={roundedTopPath}
              fill={topSegment.color}
              stroke={topSegment.color}
            />
            <rect
              x={topSegment.x - 1}
              y={topSegment.y - 1}
              width={topSegment.width + 2}
              height={height + 2}
              fill={
                focusedBar && focusedBar !== year
                  ? "rgba(255, 255, 255, 0.7)"
                  : "transparent"
              }
              style={{
                pointerEvents: "all",
                transition: "transform 0.3s ease, fill 0.3s ease",
              }}
              onMouseEnter={handleMouseEnter}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          </g>
        );
      })}
    </g>
  );
}

const EmissionBySectorChart: React.FC<EmissionBySectorChartProps> = ({
  data,
  lng,
}) => {
  const { hideTooltip, showTooltipFromEvent } = useTooltip();
  const { t: tData } = useTranslation(lng, "data");
  const defaultBreakdown = SECTORS.reduce((acc, sector) => {
    return {
      ...acc,
      [toKebabCaseModified(sector.name)]: 0,
    };
  }, {});

  const customTooltip = (point: CombinedPoint) => {
    return (
      <Box backgroundColor="white" borderRadius="8px" boxShadow="2dp">
        <Box>
          <Box
            className="py-3 px-4"
            borderBottom="1px solid"
            borderColor="border.overlay"
          >
            <Text
              fontSize="title.sm"
              fontWeight="600"
              color="content.secondary"
            >
              {point.data.year}
            </Text>
            <Text fontSize="label.sm" fontWeight="500" color="content.tertiary">
              {tData("total-emissions")}
            </Text>
          </Box>
          <Box py="3" px="4" className="flex flex-col gap-2.5 mt-2">
            {point.data.segments
              .filter((s) => s.value != 0)
              .map((segment) => (
                <Box
                  key={segment.id}
                  className="flex text-start items-center gap-2 justify-between"
                >
                  <Box
                    className="h-4 w-4"
                    style={{ backgroundColor: segment.color }}
                  ></Box>
                  <Text
                    fontSize="body.md"
                    textAlign="left"
                    flex={1}
                    color="content.secondary"
                  >
                    {tData(toKebabCaseModified(segment.id))}
                  </Text>
                  <Text
                    fontSize="body.md"
                    px={2}
                    textAlign="right"
                    color="content.primary"
                  >
                    {segment.percentage.toFixed(2)}%
                  </Text>
                  <Text
                    fontSize="body.md"
                    textAlign="right"
                    color="content.primary"
                  >
                    {convertKgToTonnes(segment.value)}
                  </Text>
                </Box>
              ))}
          </Box>
          <Box
            marginTop="2"
            display="flex"
            justifyContent="space-between"
            py="3"
            px="4"
            borderTop="1px solid"
            borderColor="border.overlay"
            alignItems="center"
          >
            <Text
              fontSize="body.md"
              fontWeight="600"
              textAlign="left"
              className="capitalize"
              color="content.primary"
            >
              {tData("total")}
            </Text>
            <Text
              fontSize="body.md"
              fontWeight="600"
              textAlign="right"
              color="content.primary"
            >
              {convertKgToTonnes(point.data.total)}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  };

  const chartData: Record<string, any>[] = data
    .map((item) => {
      const sectorBreakDown = item.bySector.reduce((acc, sector) => {
        return {
          ...acc,
          [toKebabCaseModified(sector.sectorName)]: sector.co2eq,
        };
      }, defaultBreakdown);
      return {
        year: item.year,
        ...sectorBreakDown,
      };
    })
    .reverse();

  const chartDataKeys = SECTORS.map((sector) =>
    toKebabCaseModified(sector.name),
  );

  const margin = { top: 50, right: 130, bottom: 50, left: 120 };

  return (
    <div className="min-h-[600px]">
      <div className="h-[600px] relative">
        <ResponsiveBar
          borderRadius={5}
          enableLabel={false}
          data={chartData}
          keys={chartDataKeys}
          indexBy="year"
          groupMode={"stacked"}
          layout={"vertical"}
          margin={margin}
          padding={0.3}
          valueScale={{ type: "linear", min: 0, max: "auto" }}
          indexScale={{ type: "band", round: true }}
          colors={allSectorColors}
          borderColor={{
            from: "color",
            modifiers: [["darker", 1.6]],
          }}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: tData("year"),
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "CO2eq",
            legendPosition: "middle",
            legendOffset: -100,
            format: (value) => convertKgToTonnes(value),
          }}
          labelSkipWidth={12}
          labelSkipHeight={12}
          labelTextColor={{
            from: "color",
            modifiers: [["darker", 1.6]],
          }}
          role="application"
          ariaLabel="Nivo bar chart demo"
          barAriaLabel={function (e) {
            return `${e.id}: ${convertKgToTonnes(e.value!)} in year: ${e.indexValue}`;
          }}
          layers={[
            "grid",
            "axes",
            "markers",
            "legends",
            (layerProps) =>
              CustomCombinedBarLayer({
                ...layerProps,
                customTooltip: customTooltip,
                margin,
              }),
          ]}
        />
      </div>
      <Text
        color="content.secondary"
        fontSize="label.large"
        className="capitalize"
        fontWeight="500"
      >
        {tData("legend")}
      </Text>
      <Box className="flex items-center justify-start flex-wrap mt-3 gap-2">
        {SECTORS.map((sector, index) => (
          <Box
            key={sector.name}
            backgroundColor="background.neutral"
            borderRadius="50px"
            className="flex items-center justify-center px-3 py-1.5"
            mr={4}
          >
            <Box
              className="h-4 w-4"
              style={{ backgroundColor: allSectorColors[index] }}
            ></Box>
            <Text
              fontSize="body.md"
              className="ml-2"
              color="content.alternative"
            >
              {tData(toKebabCaseModified(sector.name))}
            </Text>
          </Box>
        ))}
      </Box>
    </div>
  );
};

export default EmissionBySectorChart;
