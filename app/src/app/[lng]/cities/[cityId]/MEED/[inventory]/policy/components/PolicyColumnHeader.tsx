"use client";
import { chakra, HStack, Icon, Table } from "@chakra-ui/react";
import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedInfoTip } from "../../../components/MeedInfoTip";
import type { SortDirection } from "../policyRows";
import { FOCUS_RING } from "../../../focusRing";

const HEADER_CELL = {
  bg: "background.neutral",
  borderBottomWidth: "1px",
  borderColor: "border.neutral",
  py: "10px",
  verticalAlign: "middle",
} as const;

export interface PolicyColumnHeaderProps {
  label: string;
  width: string;
  align?: "start" | "end";
  /** Undefined ⇒ the column is not sortable. */
  onSort?: () => void;
  active?: boolean;
  direction?: SortDirection;
  sortAriaLabel?: string;
  tip?: string;
  tipAriaLabel?: string;
}

/**
 * A table header that actually reads as one: neutral fill, uppercase overline
 * label, a rule under it, an explicit width, and — where the data supports it —
 * a real sort control instead of a silently pre-sorted column.
 */
export function PolicyColumnHeader({
  label,
  width,
  align = "start",
  onSort,
  active = false,
  direction = "desc",
  sortAriaLabel,
  tip,
  tipAriaLabel,
}: PolicyColumnHeaderProps) {
  const justify = align === "end" ? "flex-end" : "flex-start";
  const ariaSort = !onSort
    ? undefined
    : active
      ? direction === "asc"
        ? "ascending"
        : "descending"
      : "none";

  return (
    <Table.ColumnHeader
      width={width}
      textAlign={align}
      aria-sort={ariaSort}
      {...HEADER_CELL}
    >
      <HStack gap="xs" justifyContent={justify}>
        {onSort ? (
          <chakra.button
            type="button"
            onClick={onSort}
            aria-label={sortAriaLabel}
            display="inline-flex"
            alignItems="center"
            gap="xs"
            cursor="pointer"
            borderRadius="minimal"
            px="xs"
            _hover={{ "& *": { color: "content.link" } }}
            _focusVisible={FOCUS_RING}
          >
            <Overline color={active ? "content.link" : "content.tertiary"}>
              {label}
            </Overline>
            <Icon
              as={
                active
                  ? direction === "asc"
                    ? LuArrowUp
                    : LuArrowDown
                  : LuArrowUpDown
              }
              boxSize="12px"
              color={active ? "content.link" : "content.tertiary"}
            />
          </chakra.button>
        ) : (
          <Overline>{label}</Overline>
        )}
        {tip && <MeedInfoTip content={tip} ariaLabel={tipAriaLabel ?? tip} />}
      </HStack>
    </Table.ColumnHeader>
  );
}
