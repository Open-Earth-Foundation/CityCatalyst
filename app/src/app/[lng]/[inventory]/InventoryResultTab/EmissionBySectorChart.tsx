import { SectorEmission } from "@/util/types";
import { ResponsiveBar } from "@nivo/bar";
import { SECTORS } from "@/util/constants";
import { convertKgToKiloTonnes, convertKgToTonnes } from "@/util/helpers";
import { useTranslation } from "@/i18n/client";
import { toKebabCaseModified } from "@/app/[lng]/[inventory]/InventoryResultTab/index";
import { Badge, Box, Card, HStack, Text } from "@chakra-ui/react";

interface EmissionBySectorChartProps {
  data: {
    bySector: SectorEmission[];
    year: number;
    inventoryId: string;
  }[];
  lng: string;
}

const EmissionBySectorChart: React.FC<EmissionBySectorChartProps> = ({
  data,
  lng,
}) => {
  const { t: tData } = useTranslation(lng, "data");
  const defaultBreakdown = SECTORS.reduce((acc, sector) => {
    return {
      ...acc,
      [toKebabCaseModified(sector.name)]: 0,
    };
  }, {});

  const chartData = data.map((item) => {
    const sectorBreakDown = item.bySector.reduce((acc, sector) => {
      return {
        ...acc,
        [toKebabCaseModified(sector.sectorName)]: convertKgToKiloTonnes(
          sector.co2eq,
        ),
      };
    }, defaultBreakdown);
    return {
      year: item.year,
      ...sectorBreakDown,
    };
  });

  const chartDataKeys = SECTORS.map((sector) =>
    toKebabCaseModified(sector.name),
  );

  const colors = ["#5785F4", "#F17105", "#25AC4B", "#BFA937", "#F5D949"];

  return (
    <div className="min-h-[600px]">
      <div className="h-[600px]">
        <ResponsiveBar
          borderRadius={5}
          enableLabel={false}
          data={chartData}
          keys={chartDataKeys}
          indexBy="year"
          groupMode={"stacked"}
          layout={"vertical"}
          margin={{ top: 50, right: 130, bottom: 50, left: 120 }}
          padding={0.3}
          tooltip={({ id, value, color }) => (
            <Card py={2} px={2}>
              <HStack>
                <Badge
                  colorScheme="gray"
                  boxSize="16px"
                  bg={color}
                  marginRight="8px"
                />
                <Text>
                  {tData(id as string)}
                  {" - "}
                  {convertKgToTonnes(value)}
                </Text>
              </HStack>
            </Card>
          )}
          valueScale={{ type: "linear", min: 0, max: "auto" }}
          indexScale={{ type: "band", round: true }}
          colors={colors}
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
              style={{ backgroundColor: colors[index] }}
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
