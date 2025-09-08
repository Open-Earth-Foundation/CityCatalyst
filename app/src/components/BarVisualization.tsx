import React from "react";
import { Box, HStack } from "@chakra-ui/react";

interface BarVisualizationProps {
  value: number;
  total: number;
  width?: string;
}

export const BarVisualization: React.FC<BarVisualizationProps> = ({
  value,
  total,
  width = "16px",
}) => {
  return (
    <HStack gap={1}>
      {Array.from({ length: total }).map((_, index) => (
        <Box
          key={index}
          w={width}
          h="4px"
          bg={index < value ? "blue.500" : "gray.200"}
          borderRadius="sm"
        />
      ))}
    </HStack>
  );
};