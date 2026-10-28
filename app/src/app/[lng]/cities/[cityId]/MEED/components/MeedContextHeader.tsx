"use client";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MeedInventoryMenu } from "./MeedInventoryMenu";
import { MeedBreadcrumb, type MeedCrumb } from "./MeedBreadcrumb";

export interface MeedContextHeaderProps {
  cityName?: string;
  /** Formatted emissions for the active inventory, e.g. { value: "1.1", unit: "MtCO2e" }. */
  emissions?: { value: string; unit: string };
  inventoryYear?: number;
  inventories: YearSelectorItem[];
  currentInventoryId: string;
  onInventorySelect: (item: YearSelectorItem) => void;
  crumbs: MeedCrumb[];
  t: TFunction;
}

/**
 * Slim context bar shown on every screen inside the module except the landing
 * screen, which has its own header.
 *
 * It answers three questions and nothing else: where am I, which city and
 * inventory is this, and can I change the inventory. Navigating away is the
 * footer's and the stepper's job — an earlier version also carried a back
 * chevron beside a "Back to overview" link, which was the same action twice and
 * left the chevron centred against a two-line block, aligned to nothing.
 */
export function MeedContextHeader({
  cityName,
  emissions,
  inventoryYear,
  inventories,
  currentInventoryId,
  onInventorySelect,
  crumbs,
  t,
}: MeedContextHeaderProps) {
  const facts = [
    emissions?.value ? `${emissions.value} ${emissions.unit}`.trim() : null,
    inventoryYear ? String(inventoryYear) : null,
  ].filter(Boolean);

  return (
    <Box
      w="full"
      bg="base.light"
      borderBottomWidth="1px"
      borderColor="border.overlay"
    >
      <Box mx="auto" w="full" maxW="1090px" px="l" py="m">
        <HStack justifyContent="space-between" alignItems="center" gap="m">
          {/* One left edge: the trail and the city name share an axis. */}
          <VStack alignItems="flex-start" gap="xs" minW="0">
            <MeedBreadcrumb crumbs={crumbs} />
            <HStack gap="s" alignItems="baseline" minW="0" flexWrap="wrap">
              {cityName && (
                <TitleMedium color="content.primary" truncate>
                  {cityName}
                </TitleMedium>
              )}
              {facts.length > 0 && (
                <BodySmall color="content.tertiary" whiteSpace="nowrap">
                  {facts.join(" · ")}
                </BodySmall>
              )}
            </HStack>
          </VStack>

          {inventories.length > 0 && (
            <Box flexShrink={0}>
              <MeedInventoryMenu
                inventories={inventories}
                currentInventoryId={currentInventoryId}
                onSelect={onInventorySelect}
                t={t}
              />
            </Box>
          )}
        </HStack>
      </Box>
    </Box>
  );
}
