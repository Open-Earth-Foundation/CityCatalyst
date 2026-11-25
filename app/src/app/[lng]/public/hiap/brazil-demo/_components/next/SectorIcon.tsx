"use client";
import React from "react";
import { HStack, Icon } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuDroplets,
  LuHeartPulse,
  LuLeaf,
  LuMountainSnow,
  LuWheat,
  LuZap,
} from "react-icons/lu";
import { Overline } from "@/components/package/Texts/Overline";
import type { AdaptaSector } from "../../_lib/types";
import { SECTOR_HEX } from "../../_lib/riskCells";

/** One icon per AdaptaBrasil sector, so a risk or action's category reads at a glance. */
export const SECTOR_ICON: Record<AdaptaSector, IconType> = {
  water_resources: LuDroplets,
  food_security: LuWheat,
  energy_security: LuZap,
  geohydrological_disasters: LuMountainSnow,
  health: LuHeartPulse,
  biodiversity: LuLeaf,
};

/** Sector icon in the sector's colour, with its name as an eyebrow. */
export function SectorLabel({
  sector,
  children,
  size = "16px",
}: {
  sector: AdaptaSector;
  children: React.ReactNode;
  size?: string;
}) {
  return (
    <HStack gap="xs" alignItems="center">
      <Icon
        as={SECTOR_ICON[sector]}
        boxSize={size}
        color={SECTOR_HEX[sector]}
      />
      <Overline color="content.tertiary">{children}</Overline>
    </HStack>
  );
}

/** The icon alone, for inline use next to a hazard name. */
export function SectorGlyph({
  sector,
  size = "14px",
}: {
  sector: AdaptaSector;
  size?: string;
}) {
  return (
    <Icon
      as={SECTOR_ICON[sector]}
      boxSize={size}
      color={SECTOR_HEX[sector]}
      flexShrink={0}
    />
  );
}
