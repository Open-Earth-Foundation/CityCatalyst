import { Box, HStack, Text } from "@chakra-ui/react";

import type { RunStatusTone } from "./utils";

interface StatusBadgeProps {
  label: string;
  tone: RunStatusTone;
}

const statusStyles: Record<
  RunStatusTone,
  { border?: string; color: string; surface: string }
> = {
  positive: {
    color: "sentiment.positiveDefault",
    surface: "sentiment.positiveOverlay",
  },
  warning: {
    color: "sentiment.warningDefault",
    surface: "sentiment.warningOverlay",
  },
  info: {
    color: "content.link",
    surface: "background.alternativeLight",
  },
  negative: {
    color: "sentiment.negativeDefault",
    surface: "sentiment.negativeOverlay",
  },
  neutral: {
    border: "border.neutral",
    color: "content.tertiary",
    surface: "background.backgroundLight",
  },
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const colors = statusStyles[tone];

  return (
    <HStack
      gap={1.5}
      border="1px solid"
      borderColor={colors.border ?? colors.color}
      borderRadius="pill"
      bg={colors.surface}
      px={2.5}
      py={1}
      width="fit-content"
    >
      <Box boxSize="6px" borderRadius="full" bg={colors.color} />
      <Text
        fontFamily="body"
        fontSize="label.sm"
        fontWeight="medium"
        lineHeight="16"
        color="content.secondary"
        whiteSpace="nowrap"
      >
        {label}
      </Text>
    </HStack>
  );
}
