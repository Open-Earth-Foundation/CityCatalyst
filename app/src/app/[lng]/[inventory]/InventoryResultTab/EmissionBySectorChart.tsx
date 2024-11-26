import { SectorEmission } from "@/util/types";
import { ResponsiveBar } from "@nivo/bar";
import { SECTORS } from "@/util/constants";
import { convertKgToKiloTonnes } from "@/util/helpers";
import { useTranslation } from "@/i18n/client";

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
      [tData(sector.name).toLowerCase()]: 0,
    };
  }, {});

  const chartData = data.map((item) => {
    const sectorBreakDown = item.bySector.reduce((acc, sector) => {
      return {
        ...acc,
        [tData(sector.sectorName).toLowerCase()]: convertKgToKiloTonnes(
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
    tData(sector.name).toLowerCase(),
  );

  const colors = ["#5785F4", "#F17105", "#25AC4B", "#BFA937", "#F5D949"];
  return (
    <div style={{ height: "500px" }}>
      <ResponsiveBar
        borderRadius={5}
        enableLabel={false}
        data={chartData}
        keys={chartDataKeys}
        indexBy="year"
        groupMode={"stacked"}
        layout={"vertical"}
        margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
        padding={0.3}
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
          legend: "Year",
          legendPosition: "middle",
          legendOffset: 32,
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: "CO2eq",
          legendPosition: "middle",
          legendOffset: -50,
          format: (value) => `${value} kt`,
        }}
        labelSkipWidth={12}
        labelSkipHeight={12}
        labelTextColor={{
          from: "color",
          modifiers: [["darker", 1.6]],
        }}
        legends={[
          {
            dataFrom: "keys",
            anchor: "bottom-right",
            direction: "column",
            justify: false,
            translateX: 120,
            translateY: 0,
            itemsSpacing: 2,
            itemWidth: 100,
            itemHeight: 20,
            itemDirection: "left-to-right",
            itemOpacity: 0.85,
            symbolSize: 20,
            effects: [
              {
                on: "hover",
                style: {
                  itemOpacity: 1,
                },
              },
            ],
          },
        ]}
        role="application"
        ariaLabel="Nivo bar chart demo"
        barAriaLabel={function (e) {
          return e.id + ": " + e.formattedValue + " in year: " + e.indexValue;
        }}
      />
    </div>
  );
};

export default EmissionBySectorChart;
