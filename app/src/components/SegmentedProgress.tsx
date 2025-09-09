import React, { useRef } from "react";
import { Badge, Box, Table, Text, useToken, VStack } from "@chakra-ui/react";
import {
  capitalizeFirstLetter,
  convertKgToTonnes,
  toKebabCase,
} from "@/util/helpers";

import { Tooltip } from "@/components/ui/tooltip";

export type SegmentedProgressValues =
  | number
  | { name: string; percentage: number; value: bigint };

export function SegmentedProgress({
  values,
  colors = ["interactive.connected", "interactive.tertiary"],
  max = 1,
  height = 4,
  showLabels = false,
  showHover = false,
  t = (str: string) => str,
  total,
}: {
  values: SegmentedProgressValues[];
  colors?: string[];
  max?: number;
  height?: number;
  showLabels?: boolean;
  showHover?: boolean;
  t?: (str: string) => string;
  total?: bigint;
}) {
  const colorValues = useToken("colors", colors);
  const tooltipRef = useRef(null);
  const normalizedValues = values.map((v, i) =>
    typeof v === "number"
      ? {
          percentage: v,
          name: `Segment ${i + 1}`,
          value: max,
          color: colorValues[i],
        }
      : { ...v, color: colorValues[i] },
  );
  const shownValues = normalizedValues.filter((v) => v.percentage != 0);
  const tooltipContent = (
    <Table.Root size="sm">
      <Table.Body>
        {normalizedValues.map((value, index) => (
          <Table.Row key={index}>
            <Table.Cell>
              <Text color="gray.600" mr={2}>
                {t(toKebabCase(value.name))}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Text color="gray.600" mr={2}>
                {value.percentage.toFixed(1)}%
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Text color="gray.600">{convertKgToTonnes(value.value)}</Text>
            </Table.Cell>
          </Table.Row>
        ))}
        <Table.Row>
          <Table.ColumnHeader>
            <Text color="black" fontWeight="bold" fontSize="md">
              {capitalizeFirstLetter(t("total"))}
            </Text>
          </Table.ColumnHeader>
          <Table.Cell></Table.Cell>
          <Table.ColumnHeader>
            <Text color="black" fontWeight="bold" fontSize="md">
              {convertKgToTonnes(total!)}
            </Text>
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );

  const progressBars = (
    <Tooltip
      content={tooltipContent}
      disabled={!showHover}
      positioning={{ placement: "bottom" }}
      showArrow
      contentProps={{ css: { "--tooltip-bg": "{colors.background.default}" } }}
    >
      <Box
        ref={tooltipRef}
        backgroundColor="background.neutral"
        w="full"
        display="flex"
        flexDirection="row"
        borderRightRadius="10px"
        borderLeftRadius="10px"
      >
        {shownValues.map((value, i) => (
          <Box
            key={i}
            backgroundColor={value.color}
            h={height}
            w={`${(100 * value.percentage) / max}%`}
            borderStartRadius={i === 0 ? "10px" : undefined}
            borderEndRadius={i === shownValues.length - 1 ? "10px" : undefined}
          />
        ))}
      </Box>
    </Tooltip>
  );

  if (!showLabels) {
    return progressBars;
  }

  return (
    <VStack>
      {progressBars}
      <Box
        w="full"
        display="flex"
        flexDirection="row"
        flexWrap="wrap"
        borderRadius="full"
        verticalAlign="center"
        gap={2}
      >
        {normalizedValues.map((v, i) => (
          <Badge
            key={i}
            borderWidth="1px"
            borderColor="border.neutral"
            py={2}
            px={2}
            borderRadius="10px"
            bg="base.light"
          >
            <Box
              width={3}
              height={3}
              bg={colors[i]}
              borderRadius="10px"
              mx={2}
            />
            {t(toKebabCase(v.name))}
          </Badge>
        ))}
      </Box>
    </VStack>
  );
}
