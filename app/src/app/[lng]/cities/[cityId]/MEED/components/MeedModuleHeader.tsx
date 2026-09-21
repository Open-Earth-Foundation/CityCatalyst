"use client";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyMedium } from "@/components/package/Texts/Body";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MeedInventoryMenu } from "./MeedInventoryMenu";
import { MeedBreadcrumb } from "./MeedBreadcrumb";

export interface MeedModuleHeaderProps {
  /** Module display name, used as the last breadcrumb crumb. */
  moduleLabel: string;
  title: string;
  cityName?: string;
  emissions?: { value: string; unit: string };
  inventoryYear?: number;
  inventories: YearSelectorItem[];
  currentInventoryId: string;
  onInventorySelect: (item: YearSelectorItem) => void;
  /** Link back to the city home. */
  cityHref: string;
  toolsLabel: string;
  /** Primary action, rendered on the right. */
  action?: React.ReactNode;
  t: TFunction;
}

/**
 * Header for the module's landing screen.
 *
 * Deliberately not the GHGI `Hero`: that banner is built around an inventory —
 * a 491px block of emissions stats and a city map — which is the right frame
 * for the inventory module and the wrong one here, where the subject is the
 * ranking, not the city's geography. City, project and organisation switching
 * belongs to the global side navigation, so this header does not duplicate it;
 * it only carries the inventory the ranking will run against.
 *
 * Shares its shape with `MeedContextHeader` so the landing screen and the step
 * screens read as one system.
 */
export function MeedModuleHeader({
  moduleLabel,
  title,
  cityName,
  emissions,
  inventoryYear,
  inventories,
  currentInventoryId,
  onInventorySelect,
  cityHref,
  toolsLabel,
  action,
  t,
}: MeedModuleHeaderProps) {
  return (
    <Box
      w="full"
      bg="base.light"
      borderBottomWidth="1px"
      borderColor="border.overlay"
    >
      <Box mx="auto" w="full" maxW="1090px" px="l" py="l">
        <VStack alignItems="stretch" gap="m">
          <MeedBreadcrumb
            crumbs={[
              { label: toolsLabel, href: cityHref },
              { label: moduleLabel },
            ]}
          />

          <HStack
            justifyContent="space-between"
            alignItems="flex-end"
            gap="l"
            flexWrap="wrap"
          >
            <VStack alignItems="flex-start" gap="xs" minW="280px" flex="1">
              <HeadlineSmall>{title}</HeadlineSmall>
              <HStack gap="s" color="content.tertiary" flexWrap="wrap">
                {cityName && (
                  <BodyMedium color="content.secondary">{cityName}</BodyMedium>
                )}
                {emissions?.value && (
                  <BodyMedium color="content.tertiary">
                    {emissions.value} {emissions.unit}
                    {inventoryYear ? ` · ${inventoryYear}` : ""}
                  </BodyMedium>
                )}
              </HStack>
            </VStack>

            <HStack gap="m" flexShrink={0} alignItems="center">
              {inventories.length > 0 && (
                <MeedInventoryMenu
                  inventories={inventories}
                  currentInventoryId={currentInventoryId}
                  onSelect={onInventorySelect}
                  t={t}
                />
              )}
              {action}
            </HStack>
          </HStack>
        </VStack>
      </Box>
    </Box>
  );
}
