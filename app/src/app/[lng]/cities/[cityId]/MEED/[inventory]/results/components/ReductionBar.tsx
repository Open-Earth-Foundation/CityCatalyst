"use client";
import React from "react";
import { Box, HStack } from "@chakra-ui/react";
import { REDUCTION_SEGMENTS, reductionLevelColor } from "./actionCatalog";

/**
 * Segmented 5-level reduction-potential bar. `level` is 0 (unknown) to 5
 * (very high); filled segments take the level's semantic color token.
 */
export function ReductionBar({ level }: { level: number }) {
  const color = reductionLevelColor(level);
  return (
    <HStack gap="xs" w="full">
      {Array.from({ length: REDUCTION_SEGMENTS }, (_, i) => (
        <Box
          key={i}
          flex="1"
          h="6px"
          borderRadius="full"
          bg={i < level ? color : "background.neutral"}
        />
      ))}
    </HStack>
  );
}
