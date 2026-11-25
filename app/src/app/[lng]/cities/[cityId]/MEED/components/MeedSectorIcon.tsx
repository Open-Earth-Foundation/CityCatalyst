"use client";
import React from "react";
import { Icon } from "@chakra-ui/react";
import { SECTORS } from "@/util/constants";

/**
 * The GPC sector an action belongs to, from the catalog tag
 * (`stationary_energy`, `transportation`, `waste`, `ippu`, `afolu`). The icon
 * and colour are the inventory screens' own, so a sector reads the same way
 * across CityCatalyst.
 */
export function sectorMeta(tag: string | null | undefined) {
  if (!tag) return null;
  const key = tag.toLowerCase().replace(/[_\s]+/g, "-");
  return (
    SECTORS.find(
      (s) => s.name === key || key.startsWith(s.name) || s.name.startsWith(key),
    ) ?? null
  );
}

/** Sector icon in the sector colour; renders nothing for an unknown tag. */
export function MeedSectorIcon({
  sectorTag,
  size = "16px",
}: {
  sectorTag: string | null | undefined;
  size?: string;
}) {
  const sector = sectorMeta(sectorTag);
  if (!sector) return null;
  return (
    <Icon
      as={sector.icon}
      boxSize={size}
      color={sector.color}
      flexShrink={0}
      aria-hidden
    />
  );
}
