"use client";
import React from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";

/**
 * One weighted score component row in the detail panel's score breakdown:
 * label, horizontal 0–1 bar, numeric value and the weight it contributes
 * with, plus a one-line description underneath.
 */
export function ScoreBar({
  label,
  value,
  weight,
  color,
  description,
}: {
  label: string;
  /** Score in 0..1. */
  value: number;
  /** Weight this score contributes to the final score with (0..1). */
  weight: number;
  /** Semantic color token for the filled bar. */
  color: string;
  description: string;
}) {
  const pct = Math.max(0, Math.min(value, 1)) * 100;
  return (
    <VStack alignItems="stretch" gap="xs">
      <HStack gap="s">
        <LabelMedium color="content.primary" w="140px" flexShrink={0}>
          {label}
        </LabelMedium>
        <Box
          flex="1"
          h="7px"
          bg="background.neutral"
          borderRadius="full"
          overflow="hidden"
        >
          <Box h="full" w={`${pct}%`} bg={color} borderRadius="full" />
        </Box>
        <BodyMedium
          color="content.primary"
          fontWeight="bold"
          minW="40px"
          textAlign="right"
          fontVariantNumeric="tabular-nums"
        >
          {value.toFixed(2)}
        </BodyMedium>
        <BodySmall
          color="content.tertiary"
          minW="48px"
          fontVariantNumeric="tabular-nums"
        >
          × {weight.toFixed(2)}
        </BodySmall>
      </HStack>
      <BodySmall color="content.secondary" pl="150px">
        {description}
      </BodySmall>
    </VStack>
  );
}
