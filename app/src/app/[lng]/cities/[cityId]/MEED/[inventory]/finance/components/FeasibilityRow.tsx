"use client";
import { Box, HStack, Icon, IconButton, Table } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { MeedMeter } from "../../../components/MeedMeter";
import {
  FOCUS_RING,
  humanizeEnum,
  routeKeyOf,
  scoreTone,
  TONE_TEXT_COLOR,
} from "../labels";
import type { FeasibilityRow as FeasibilityRowData } from "../types";
import { RouteTag } from "./RouteTag";
import { RowDetail } from "./RowDetail";

export interface FeasibilityRowProps {
  row: FeasibilityRowData;
  expanded: boolean;
  onToggle: () => void;
  cityId: string;
  cityName: string;
  t: TFunction;
}

/** One action in the feasibility table, with its detail behind a disclosure. */
export function FeasibilityRow({
  row,
  expanded,
  onToggle,
  cityId,
  cityName,
  t,
}: FeasibilityRowProps) {
  const routeKey = routeKeyOf(row.route);
  const selfFundable = routeKey === "self";
  const fundCount = row.inputs?.finance?.n_reachable_opportunities ?? 0;
  const tone = scoreTone(row.financial_feasibility);
  const name = row.action_name ?? row.action_id;
  const detailId = `finance-detail-${row.action_id}`;

  return (
    <>
      <Table.Row>
        <Table.Cell verticalAlign="top">
          <HStack gap="s" alignItems="flex-start">
            <IconButton
              aria-label={t(expanded ? "collapse-row" : "expand-row", {
                action: name,
              })}
              aria-expanded={expanded}
              aria-controls={detailId}
              size="2xs"
              variant="ghost"
              flexShrink={0}
              onClick={onToggle}
              _focusVisible={FOCUS_RING}
            >
              <Icon as={expanded ? LuChevronDown : LuChevronRight} />
            </IconButton>
            <BodyMedium color="content.primary" wordBreak="break-word">
              {name}
            </BodyMedium>
          </HStack>
        </Table.Cell>
        <Table.Cell verticalAlign="top">
          <Caption>{humanizeEnum(row.sector)}</Caption>
        </Table.Cell>
        {/* nowrap + a non-shrinking tag: together they stop "Self-deliverable"
            truncating to "Self…". */}
        <Table.Cell whiteSpace="nowrap" verticalAlign="top">
          <Box display="flex">
            <RouteTag routeKey={routeKey} t={t} />
          </Box>
        </Table.Cell>
        <Table.Cell textAlign="end" verticalAlign="top">
          <HStack gap="s" justifyContent="flex-end">
            <Box
              w="40px"
              flexShrink={0}
              display={{ base: "none", lg: "block" }}
            >
              <MeedMeter
                value={row.financial_feasibility}
                tone={tone}
                ariaLabel={`${name} — ${row.financial_feasibility.toFixed(2)}`}
              />
            </Box>
            <LabelMedium
              color={TONE_TEXT_COLOR[tone]}
              fontVariantNumeric="tabular-nums"
              textAlign="end"
            >
              {row.financial_feasibility.toFixed(2)}
            </LabelMedium>
          </HStack>
        </Table.Cell>
        <Table.Cell
          textAlign="end"
          whiteSpace="nowrap"
          verticalAlign="top"
          fontVariantNumeric="tabular-nums"
        >
          <BodyMedium
            color={
              selfFundable || fundCount === 0
                ? "content.tertiary"
                : "content.primary"
            }
          >
            {selfFundable
              ? t("fund-access-self")
              : fundCount > 0
                ? t("fund-access-direct", { n: fundCount })
                : "—"}
          </BodyMedium>
        </Table.Cell>
      </Table.Row>

      {expanded && (
        <Table.Row bg="background.neutral">
          <Table.Cell colSpan={5} id={detailId} p="0">
            <RowDetail row={row} cityId={cityId} cityName={cityName} t={t} />
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}
