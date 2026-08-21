import { Box, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";

import { PlanBadgeWatermarkIcon } from "@/components/icons";
import { OrganizationPlanType } from "@/util/enums";

interface PlanBadgeProps {
  planType: OrganizationPlanType;
  trialDaysRemaining: number | null;
  t: TFunction;
}

const planStyles: Record<
  OrganizationPlanType,
  { background: string; labelKey: string }
> = {
  [OrganizationPlanType.TRIAL]: {
    background: "#24BE00",
    labelKey: "trial-plan",
  },
  [OrganizationPlanType.DEMO]: {
    background: "#232640",
    labelKey: "demo-plan",
  },
  [OrganizationPlanType.FULL]: {
    background: "#2351DC",
    labelKey: "full-plan",
  },
};

export function PlanBadge({ planType, trialDaysRemaining, t }: PlanBadgeProps) {
  const { background, labelKey } =
    planStyles[planType] ?? planStyles[OrganizationPlanType.FULL];

  return (
    <Box position="relative" w="142px" h="155px" flexShrink={0}>
      <svg viewBox="-4 -4 108 123" width="100%" height="100%" aria-hidden>
        <polygon
          points="50,0 100,28.75 100,86.25 50,115 0,86.25 0,28.75"
          fill={background}
          stroke={background}
          strokeWidth="10"
          strokeLinejoin="round"
        />
      </svg>
      <Box
        position="absolute"
        left="4px"
        top="40px"
        opacity={0.9}
        transform="scale(1.8)"
        transformOrigin="left"
        pointerEvents="none"
        aria-hidden
      >
        <PlanBadgeWatermarkIcon />
      </Box>
      <Box
        position="absolute"
        inset={0}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        color="white"
        textAlign="center"
        px={3}
        gap={1}
      >
        <Text
          fontSize="label.sm"
          fontWeight="bold"
          letterSpacing="widest"
          textTransform="uppercase"
          lineHeight="16px"
        >
          {t(labelKey)}
        </Text>
        {planType === OrganizationPlanType.TRIAL &&
          trialDaysRemaining !== null && (
            <Text fontSize="label.sm" lineHeight="16px">
              {t("days-remaining", { count: trialDaysRemaining })}
            </Text>
          )}
      </Box>
    </Box>
  );
}
