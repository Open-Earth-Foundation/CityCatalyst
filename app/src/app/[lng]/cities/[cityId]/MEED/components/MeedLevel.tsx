"use client";
import React from "react";
import { Box, HStack } from "@chakra-ui/react";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedInfoTip } from "./MeedInfoTip";
import { MEED_TONE_DOT, type MeedTone } from "./meedTones";

/**
 * The one way a qualitative level is shown: a dot and a word. Green is
 * favourable, amber moderate, red unfavourable, on every assessment (cost,
 * capacity, legal standing, policy backing). No pill and no bar, so a row of
 * levels reads as text and a word is never mistaken for a measured quantity —
 * real 0–100 values keep `MeedMeter`.
 */
export function MeedLevel({
  tone,
  children,
  label,
  info,
}: {
  tone: MeedTone;
  children: React.ReactNode;
  /** Optional eyebrow above the level, for card and drawer facts. */
  label?: string;
  /** What the dimension means, shown as an "i" tip beside the label. */
  info?: string;
}) {
  const row = (
    <HStack gap="s" alignItems="center" data-testid="level">
      <Box
        boxSize="8px"
        borderRadius="full"
        bg={MEED_TONE_DOT[tone]}
        flexShrink={0}
      />
      <BodySmall color="content.primary" fontWeight="semibold">
        {children}
      </BodySmall>
    </HStack>
  );
  if (!label) return row;
  return (
    <Box>
      <HStack gap="xs" alignItems="center" mb="xs">
        <Overline color="content.tertiary">{label}</Overline>
        {info && <MeedInfoTip content={info} ariaLabel={info} />}
      </HStack>
      {row}
    </Box>
  );
}
