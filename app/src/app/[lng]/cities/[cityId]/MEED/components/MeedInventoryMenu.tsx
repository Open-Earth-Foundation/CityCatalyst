"use client";
import { Box, HStack, Icon } from "@chakra-ui/react";
import { LuCalendar, LuCheck, LuChevronDown } from "react-icons/lu";
import type { TFunction } from "i18next";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { FOCUS_RING } from "../focusRing";

export interface MeedInventoryMenuProps {
  inventories: YearSelectorItem[];
  currentInventoryId: string;
  onSelect: (item: YearSelectorItem) => void;
  t: TFunction;
}

/**
 * Compact inventory-year switcher for the context header.
 *
 * The shared `YearSelector` renders a row of year *cards*, which is right for
 * the overview but far too heavy for a slim header bar — hence this dropdown.
 * Both write to the same route, so switching year anywhere keeps the user on
 * the screen they were on.
 */
export function MeedInventoryMenu({
  inventories,
  currentInventoryId,
  onSelect,
  t,
}: MeedInventoryMenuProps) {
  const current = inventories.find(
    (inv) => inv.inventoryId === currentInventoryId,
  );

  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <Box
          as="button"
          aria-label={t("switch-inventory")}
          display="flex"
          alignItems="center"
          gap="s"
          px="m"
          py="s"
          borderWidth="1px"
          borderColor="border.neutral"
          borderRadius="pill"
          bg="base.light"
          color="content.secondary"
          cursor="pointer"
          _hover={{ borderColor: "content.link", color: "content.link" }}
          _focusVisible={FOCUS_RING}
        >
          <Icon as={LuCalendar} boxSize="14px" />
          <Box
            as="span"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="medium"
            whiteSpace="nowrap"
          >
            {current?.year ?? "—"}
          </Box>
          <Icon as={LuChevronDown} boxSize="14px" />
        </Box>
      </MenuTrigger>
      <MenuContent minW="200px" zIndex={2000}>
        {inventories.map((inv) => {
          const isCurrent = inv.inventoryId === currentInventoryId;
          return (
            <MenuItem
              key={inv.inventoryId}
              value={inv.inventoryId}
              onClick={() => !isCurrent && onSelect(inv)}
            >
              <HStack justifyContent="space-between" w="full">
                <Box as="span">{inv.year}</Box>
                {isCurrent && (
                  <Icon
                    as={LuCheck}
                    boxSize="14px"
                    color="interactive.tertiary"
                  />
                )}
              </HStack>
            </MenuItem>
          );
        })}
      </MenuContent>
    </MenuRoot>
  );
}
