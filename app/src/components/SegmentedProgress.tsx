import { Box, useToken } from "@chakra-ui/react";

export function SegmentedProgress({
  values,
  colors = ["interactive.connected", "interactive.tertiary"],
  max = 1,
  height = 4,
}: {
  values: number[];
  colors?: string[];
  max?: number;
  height?: number;
}) {
  const colorValues = useToken("colors", colors);
  return (
    <Box
      backgroundColor="background.neutral"
      w="full"
      className="flex flex-row"
      borderRadius="full"
    >
      {values.map((value, i) => (
        <Box
          key={i}
          backgroundColor={colorValues[i]}
          h={height}
          w={`${(100 * value) / max}%`}
          borderStartRadius={
            i == 0 || (i == 1 && values[0] == 0) ? "full" : undefined
          }
          borderEndRadius={i == values.length - 1 ? "full" : undefined}
        />
      ))}
    </Box>
  );
}
