"use client";
import React from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Tooltip } from "@/components/ui/tooltip";

export interface MeedChartTipRow {
  label: string;
  value?: string;
  /** Colour token or hex for a leading swatch. */
  swatch?: string;
}

/**
 * The hover explanation every MEED visual carries: a short title, one row
 * per figure (with the swatch the bar uses, so colour and number connect),
 * and an optional plain-language note on what the figure means.
 *
 * Wraps the shared `Tooltip`; the trigger is whatever it wraps, which must
 * be a hoverable element (the bars and rings are `role="img"` boxes).
 */
export function MeedChartTip({
  title,
  rows = [],
  note,
  children,
}: {
  title?: string;
  rows?: MeedChartTipRow[];
  note?: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip
      showArrow
      openDelay={150}
      positioning={{ placement: "top" }}
      contentProps={{ maxW: "360px", px: "m", py: "s" }}
      content={
        <VStack alignItems="stretch" gap="xs">
          {title && (
            <Text
              fontFamily="heading"
              fontSize="label.md"
              fontWeight="semibold"
            >
              {title}
            </Text>
          )}
          {rows.map((row) => (
            <HStack key={row.label} justifyContent="space-between" gap="m">
              <HStack gap="xs" alignItems="center" minW={0}>
                {row.swatch && (
                  <Box
                    boxSize="8px"
                    borderRadius="full"
                    bg={row.swatch}
                    flexShrink={0}
                  />
                )}
                <Text fontSize="body.sm">{row.label}</Text>
              </HStack>
              {row.value && (
                <Text
                  fontSize="body.sm"
                  fontVariantNumeric="tabular-nums"
                  whiteSpace="nowrap"
                >
                  {row.value}
                </Text>
              )}
            </HStack>
          ))}
          {note && (
            <Text fontSize="caption" opacity={0.85} mt="xs">
              {note}
            </Text>
          )}
        </VStack>
      }
    >
      {children}
    </Tooltip>
  );
}
