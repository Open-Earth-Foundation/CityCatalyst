"use client";
import {
  Box,
  HStack,
  Icon,
  Link as ChakraLink,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MeedInventoryMenu } from "./MeedInventoryMenu";

export interface MeedContextHeaderProps {
  cityName?: string;
  /** Formatted emissions for the active inventory, e.g. { value: "1.1", unit: "MtCO2e" }. */
  emissions?: { value: string; unit: string };
  inventoryYear?: number;
  inventories: YearSelectorItem[];
  currentInventoryId: string;
  onInventorySelect: (item: YearSelectorItem) => void;
  /** Where the back chevron and the second breadcrumb crumb lead. */
  backHref: string;
  backLabel: string;
  /** Current screen, shown as the last breadcrumb crumb. */
  currentLabel: string;
  lng: string;
  t: TFunction;
}

/**
 * Slim context bar shown on every screen inside the module except the overview.
 *
 * The overview keeps the full Hero; repeating that 491px banner on each step
 * pushed the actual content below the fold, but dropping it entirely (as the
 * first version did) left steps with no anchor at all — no city name, no
 * inventory year, and no way to change inventory without going back.
 */
export function MeedContextHeader({
  cityName,
  emissions,
  inventoryYear,
  inventories,
  currentInventoryId,
  onInventorySelect,
  backHref,
  backLabel,
  currentLabel,
  lng,
  t,
}: MeedContextHeaderProps) {
  return (
    <Box
      w="full"
      bg="base.light"
      borderBottomWidth="1px"
      borderColor="border.overlay"
    >
      <Box mx="auto" w="full" maxW="1090px" px="l" py="m">
        <HStack justifyContent="space-between" alignItems="center" gap="m">
          <HStack gap="m" minW="0">
            <ChakraLink
              asChild
              aria-label={backLabel}
              color="content.tertiary"
              _hover={{ color: "content.link" }}
              _focusVisible={{
                outline: "2px solid",
                outlineColor: "content.link",
                outlineOffset: "2px",
              }}
            >
              <NextLink href={backHref}>
                <Icon as={LuChevronLeft} boxSize="20px" />
              </NextLink>
            </ChakraLink>

            <VStack alignItems="flex-start" gap="0" minW="0">
              {/* Breadcrumb: where this screen sits, and the way out. */}
              <HStack gap="xs" color="content.tertiary">
                <ChakraLink
                  asChild
                  color="content.tertiary"
                  textDecoration="underline"
                  _hover={{ color: "content.link" }}
                >
                  <NextLink href={backHref}>
                    <Overline>{backLabel}</Overline>
                  </NextLink>
                </ChakraLink>
                <Icon as={LuChevronRight} boxSize="12px" />
                <Overline color="content.secondary">{currentLabel}</Overline>
              </HStack>
              <HStack gap="s" alignItems="baseline" minW="0">
                <TitleMedium color="content.primary" truncate>
                  {cityName ?? ""}
                </TitleMedium>
                {emissions?.value && (
                  <BodySmall color="content.tertiary" whiteSpace="nowrap">
                    {emissions.value} {emissions.unit}
                    {inventoryYear ? ` · ${inventoryYear}` : ""}
                  </BodySmall>
                )}
              </HStack>
            </VStack>
          </HStack>

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
