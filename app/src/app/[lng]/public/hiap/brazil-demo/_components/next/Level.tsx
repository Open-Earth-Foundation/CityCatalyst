"use client";
import React from "react";
import { Box, HStack } from "@chakra-ui/react";
import type { MeedTone } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedInfoTip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedInfoTip";

const DOT: Record<MeedTone, string> = {
  positive: "interactive.tertiary",
  warning: "sentiment.warningDefault",
  caution: "interactive.quaternary",
  negative: "sentiment.negativeDefault",
  info: "content.link",
  neutral: "content.tertiary",
};

/**
 * The one way a level is shown on the proposal screens: a dot and a word.
 * Green is favourable, amber moderate, red unfavourable, on every
 * assessment (risk, cost, legal capacity, funding gap, policy backing,
 * co-benefit effect). No pills, so a row of levels reads as text.
 */
export function Level({
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
      <Box boxSize="8px" borderRadius="full" bg={DOT[tone]} flexShrink={0} />
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
