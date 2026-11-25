"use client";
import { chakra, HStack, Icon, Table } from "@chakra-ui/react";
import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedInfoTip } from "./MeedInfoTip";
import { FOCUS_RING } from "../focusRing";

const HEADER_CELL = {
  bg: "background.neutral",
  borderBottomWidth: "1px",
  borderColor: "border.neutral",
  py: "s",
  verticalAlign: "middle",
} as const;

export type MeedSortDirection = "asc" | "desc";

export interface MeedColumnHeaderProps extends Omit<
  Table.ColumnHeaderProps,
  "width" | "align"
> {
  /** Omit for an empty header cell (e.g. the row-action column). */
  label?: string;
  /** Keep the label for assistive tech only (a checkbox column needs no visible heading). */
  hideLabel?: boolean;
  width?: string;
  align?: "start" | "end";
  /** Undefined ⇒ the column is not sortable. */
  onSort?: () => void;
  active?: boolean;
  direction?: MeedSortDirection;
  sortAriaLabel?: string;
  tip?: string;
  tipAriaLabel?: string;
}

/**
 * A table header that reads as one across the MEED tables: neutral fill,
 * uppercase overline label, a rule under it, an explicit width, and a real
 * sort control where the column sorts.
 */
export function MeedColumnHeader({
  label,
  hideLabel = false,
  width,
  align = "start",
  onSort,
  active = false,
  direction = "desc",
  sortAriaLabel,
  tip,
  tipAriaLabel,
  ...rest
}: MeedColumnHeaderProps) {
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
      {...rest}
    >
      {label && (
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
            <Overline color="content.tertiary" srOnly={hideLabel || undefined}>
              {label}
            </Overline>
          )}
          {tip && <MeedInfoTip content={tip} ariaLabel={tipAriaLabel ?? tip} />}
        </HStack>
      )}
    </Table.ColumnHeader>
  );
}
