import { Badge, Box, Flex, useToken, VStack } from "@chakra-ui/react";

export function SegmentedProgressWithNames({
  values,
  colors = [
    "interactive.connected",
    "interactive.tertiary",
    "interactive.secondary",
  ],
  max = 1,
  height = 4,
  t,
}: {
  values: { name: string; value: number }[];
  colors?: string[];
  max?: number;
  height?: number;
  t: Function;
}) {
  const colorValues = useToken("colors", colors);
  return (
    <VStack>
      <Box
        backgroundColor="background.neutral"
        w="full"
        display="flex"
        flexDirection="row"
        borderRadius="full"
      >
        {values.map((value, i) => (
          <Box
            key={i}
            backgroundColor={colorValues[i]}
            h={height}
            w={`${(100 * value.value) / max}%`}
            borderStartRadius={
              i == 0 || (i == 1 && values[0].value == 0) ? "full" : undefined
            }
            borderEndRadius={i == values.length - 1 ? "full" : undefined}
          />
        ))}
      </Box>
      <Box w="full" display="flex" flexDirection="row" borderRadius="full">
        {values.map((v, i) => (
          <Badge
            key={v.name}
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
              {t(v.name)}
            </Flex>
          </Badge>
        ))}
      </Box>
    </VStack>
  );
}
