import React from "react";
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

interface PointData {
  x: string;
  y: number;
  yStacked: number;
  xFormatted: string;
  yFormatted: string;
}

interface Point {
  id: string;
  index: number;
  serieId: string;
  serieColor: string;
  x: number;
  y: number;
  color: string;
  borderColor: string;
  data: PointData;
}

interface TooltipCardProps {
  point: Point;
  data: { id: string; color: string; data: { x: string; y: string }[] }[];
  forecast: any;
  t: TFunction;
}

const TooltipCard = ({ point, data, forecast, t }: TooltipCardProps) => {
  console.log("point", JSON.stringify(point, null, 2)); // TODO NINA
  console.log("data", JSON.stringify(data, null, 2)); // TODO NINA
  console.log("forecast", JSON.stringify(forecast, null, 2)); // TODO NINA
  const year = point.data.x;
  const sumOfYs = data.reduce((sum, series) => {
    const yearData = series.data.find(({ x }) => x === year);
    return sum + parseInt((yearData?.y as unknown as string) || "0");
  }, 0);

  // Get the container width
  const containerWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  // Get the x position from the point
  const xPosition = point.x;
  const GRAPH_RATIO = 0.68; // the ratio of the graph to the container
  // Determine if we're in the left or right half of the screen
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
                  ? ((parseInt(yearData.y) / sumOfYs) * 100).toFixed(2)
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
