"use client";
import { Box, HStack, Icon, IconButton, Table, VStack } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { MeedLevel } from "../../../components/MeedLevel";
import { MeedSectorIcon } from "../../../components/MeedSectorIcon";
import {
  enumLabel,
  FOCUS_RING,
  fundAccessLabelKey,
  isSelfFundable,
  routeKeyOf,
  SCORE_LEVEL_META,
  scoreLevel,
  SECTOR_KEYS,
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
  /** Page language, for translated project names in the detail. */
  lng?: string;
}

/** One action in the feasibility table, with its detail behind a disclosure. */
export function FeasibilityRow({
  row,
  expanded,
  onToggle,
  cityId,
  cityName,
  t,
  lng,
}: FeasibilityRowProps) {
  const routeKey = routeKeyOf(row.route);
  const selfFundable = isSelfFundable(row.route);
  const fundCount = row.inputs?.finance?.n_reachable_opportunities ?? 0;
  const fundAccessKey = fundAccessLabelKey(row.inputs?.finance?.fund_access);
  const level = SCORE_LEVEL_META[scoreLevel(row.financial_feasibility)];
  const tone = level.tone;
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
          <HStack gap="xs" alignItems="center">
            <MeedSectorIcon sectorTag={row.sector} size="14px" />
            <Caption>
              {row.sector_label ?? enumLabel(SECTOR_KEYS, row.sector, t)}
            </Caption>
          </HStack>
        </Table.Cell>
        {/* nowrap + a non-shrinking tag: together they stop "Self-deliverable"
            truncating to "Self…". */}
        <Table.Cell whiteSpace="nowrap" verticalAlign="top">
          <Box display="flex">
            <RouteTag routeKey={routeKey} route={row.route} t={t} />
          </Box>
        </Table.Cell>
        <Table.Cell textAlign="end" verticalAlign="top">
          <VStack gap="xs" alignItems="flex-end">
            <LabelMedium
              color={TONE_TEXT_COLOR[tone]}
              fontVariantNumeric="tabular-nums"
              textAlign="end"
            >
              {row.financial_feasibility.toFixed(2)}
            </LabelMedium>
            <MeedLevel tone={tone}>{t(level.labelKey)}</MeedLevel>
          </VStack>
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
                ? t(fundAccessKey, { n: fundCount })
                : "—"}
          </BodyMedium>
        </Table.Cell>
      </Table.Row>

      {expanded && (
        <Table.Row bg="background.neutral">
          <Table.Cell colSpan={5} id={detailId} p="0">
            <RowDetail
              row={row}
              cityId={cityId}
              cityName={cityName}
              t={t}
              lng={lng}
            />
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}
