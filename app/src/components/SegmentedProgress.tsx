import React, { useRef } from "react";
import {
  Badge,
  Box,
  Flex,
  Table,
  Text,
  useToken,
  VStack,
} from "@chakra-ui/react";
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
  colors = [
    "interactive.connected",
    "interactive.tertiary",
    "interactive.secondary",
    "sentiment.negativeDefault",
    "interactive.control",
  ],
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
      ? { percentage: v, name: `Segment ${i + 1}`, value: max }
      : v,
  );
  const tooltipContent = (
    <Table.Root unstyled size={"sm"}>
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
          <Table.Cell>
            <Text color="black" fontWeight="bold" fontSize={"md"}>
              {capitalizeFirstLetter(t("total"))}
            </Text>
          </Table.Cell>
          <Table.Cell></Table.Cell>
          <Table.Cell>
            <Text color="black" fontWeight="bold" fontSize={"md"}>
              {convertKgToTonnes(total!)}
            </Text>
          </Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );

  const progressBars = (
    <Tooltip
      content={tooltipContent}
      disabled={!showHover}
      positioning={{
        placement: "bottom",
      }}
      showArrow
    >
      <Box
        ref={tooltipRef}
        backgroundColor="background.neutral"
        w="full"
        className="flex flex-row"
        borderRadius="full"
      >
        {normalizedValues.map((value, i) => (
          <Box
            key={i}
            backgroundColor={colorValues[i]}
            h={height}
            w={`${(100 * value.percentage) / max}%`}
            borderStartRadius={
              i === 0 ||
              (i === 1 && (normalizedValues[0].percentage ?? 0) === 0)
                ? "full"
                : undefined
            }
            borderEndRadius={
              i === normalizedValues.length - 1 ? "full" : undefined
            }
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
      <Box w="full" className="flex flex-row flex-wrap" borderRadius="full">
        {normalizedValues.map((v, i) => (
          <Badge
            key={i}
            borderWidth="1px"
            borderColor="border.neutral"
            py={1}
            px={2}
            marginRight={2}
            borderRadius="full"
            bg="base.light"
          >
            <Flex>
              <Box
                width={3}
                height={3}
                bg={colors[i]}
                borderRadius="full"
                mx={2}
                my={1}
              />
              {t(toKebabCase(v.name))}
            </Flex>
          </Badge>
        ))}
      </Box>
    </VStack>
  );
}
