import React, { useCallback, useEffect, useState } from "react";
import { Box, Card, Heading, HStack, Table, Text } from "@chakra-ui/react";
import { convertKgToTonnes, toKebabCase } from "@/util/helpers";
import {
  getReferenceNumberByName,
  getSubSectorByName,
  ISector,
} from "@/util/constants";
import { ColoredCircle } from "@/components/ColoredCircle";
import { ButtonSmall } from "@/components/Texts/Button";
import { TitleMedium } from "@/components/Texts/Title";
import { getColorForSeries } from "./EmissionsForecastChart";
import type { TFunction } from "i18next";
import { EmissionsForecastData } from "@/util/types";
import type { Point } from "@nivo/line";

interface LineChartData {
  id: string;
  color: string;
  data: { x: string; y: number }[];
}

interface TooltipCardProps {
  point: Point;
  data: LineChartData[];
  forecast: EmissionsForecastData;
  t: TFunction;
}

function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function (this: void, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const TooltipCard = ({ point, data, forecast, t }: TooltipCardProps) => {
  const [containerWidth, setContainerWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );

  const handleResize = useCallback(() => {
    setContainerWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    const debouncedResize = debounce(handleResize, 100);
    window.addEventListener("resize", debouncedResize);
    return () => {
      window.removeEventListener("resize", debouncedResize);
    };
  }, [handleResize]);

  const year = point.data.x;
  const sumOfYs = data.reduce((sum, series) => {
    const yearData = series.data.find(({ x }) => x === year);
    return sum + parseInt((yearData?.y as unknown as string) || "0");
  }, 0);

  const xPosition = point.x;
  const GRAPH_RATIO = 0.68;
  const isLeftHalf = xPosition < (containerWidth * GRAPH_RATIO) / 2;
  return (
    <div
      style={{
        background: "white",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        borderRadius: "4px",
        transform: isLeftHalf
          ? "translateX(10px)" // Small offset to the right when on left half
          : "translateX(-10px)", // Move left by its width plus small offset when on right half
      }}
    >
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
                <Table.ColumnHeader></Table.ColumnHeader>
                <Table.ColumnHeader>
                  <TitleMedium>{convertKgToTonnes(sumOfYs)}</TitleMedium>
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Body>
          </Table.Root>
        </Box>
      </Card.Root>
    </div>
  );
};

export default TooltipCard;
