"use client";
import React, { useMemo, useState } from "react";
import {
  Box,
  chakra,
  Collapsible,
  HStack,
  Icon,
  IconButton,
  Table,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react";
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronDown,
  LuChevronUp,
  LuDownload,
  LuEllipsisVertical,
  LuPin,
  LuSquareArrowOutUpRight,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import {
  MenuContent,
  MenuItem,
  MenuRadioItem,
  MenuRadioItemGroup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedInfoTip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedInfoTip";
import { SelectActionCheckbox } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/SelectActionCheckbox";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { NotRankedAction } from "../../_lib/ranking";
import type { useLabels } from "../../_lib/useLabels";
import { pick } from "../../_lib/localized";
import { SECTOR_LABEL, UNCOVERED_HAZARD_LABEL } from "../../_lib/riskCells";
import { relatedActions } from "../../_lib/relationships";
import { FilterBar } from "./FilterBar";
import { ReportControl } from "./ReportControl";
import { Level } from "./Level";
import { SectorLabel } from "./SectorIcon";
import { TextLink } from "./TextLink";
import {
  applyCityOrder,
  COST_TONE,
  GAP_TONE,
  matchesFilters,
  movedCount,
  POLICY_TONE,
  SORT_KEYS,
  sortRows,
  type RankedRow,
  type RowFilters,
  type SortKey,
} from "./rows";

function RowMenu({
  row,
  name,
  t,
  onOpen,
  onMove,
  onPin,
  onExclude,
}: {
  row: RankedRow;
  name: string;
  t: TFunction;
  onOpen: (row: RankedRow) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onPin: (id: string) => void;
  onExclude: (id: string) => void;
}) {
  return (
    <MenuRoot positioning={{ placement: "bottom-end" }}>
      <MenuTrigger asChild>
        <IconButton
          aria-label={t("next-row-menu-aria", { name })}
          size="xs"
          variant="ghost"
          _focusVisible={FOCUS_RING}
        >
          <Icon as={LuEllipsisVertical} color="content.secondary" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem value="details" onClick={() => onOpen(row)}>
          {t("next-view-details")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem value="up" onClick={() => onMove(row.action.id, -1)}>
          <Icon as={LuArrowUp} /> {t("next-move-up")}
        </MenuItem>
        <MenuItem value="down" onClick={() => onMove(row.action.id, 1)}>
          <Icon as={LuArrowDown} /> {t("next-move-down")}
        </MenuItem>
        <MenuItem value="pin" onClick={() => onPin(row.action.id)}>
          <Icon as={LuPin} /> {t("next-pin-top")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          value="exclude"
          color="sentiment.negativeDefault"
          onClick={() => onExclude(row.action.id)}
        >
          {t("next-exclude")}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}

/**
 * Section 3 of BR-N1: every ranked action, in order. The order is the
 * ranking; nothing else says "rank". Each row shows the risk the action
 * reduces and four delivery facts as levels in words. Filters narrow the
 * list; the row menu reworks the order; the collapsed footnote holds what
 * is not scored.
 */
export function RankedActionsTable({
  rows,
  cityOrder,
  notRanked,
  filters,
  onFiltersChange,
  lng,
  t,
  tResults,
  labels,
  selectedIds,
  onToggleSelect,
  onOpen,
  onOpenUnranked,
  onExclude,
  onInclude,
  onMove,
  onPin,
  onResetOrder,
  onExportCsv,
  report,
  forceList = false,
  onAdjust,
}: {
  /** All ranked rows, in suggested order; the list filters and orders them. */
  rows: RankedRow[];
  cityOrder?: string[];
  notRanked?: NotRankedAction[];
  filters: RowFilters;
  onFiltersChange: (next: RowFilters) => void;
  lng: string;
  t: TFunction;
  tResults: TFunction;
  labels: ReturnType<typeof useLabels>;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onOpen: (row: RankedRow) => void;
  onOpenUnranked: (item: NotRankedAction) => void;
  onExclude: (id: string) => void;
  onInclude: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onPin: (id: string) => void;
  onResetOrder: () => void;
  onExportCsv: () => void;
  report: {
    onGenerate: () => void;
    isGenerating: boolean;
    progress: string | null;
  };
  /** Render the stacked list even on desktop, when the table has no room (side panel open). */
  forceList?: boolean;
  /** Opens the preferences panel from the list itself. */
  onAdjust?: () => void;
}) {
  const order = useMemo(() => cityOrder ?? [], [cityOrder]);
  const unscored = notRanked ?? [];
  const hasOwnOrder = order.length > 0;
  const [sort, setSort] = useState<SortKey>("priority");
  const [footnoteOpen, setFootnoteOpen] = useState(false);
  const isNarrow =
    (useBreakpointValue({ base: true, lg: false }) ?? false) || forceList;

  const visible = useMemo(
    () => rows.filter((r) => matchesFilters(r, filters)),
    [rows, filters],
  );
  const ordered = useMemo(
    () =>
      hasOwnOrder ? applyCityOrder(visible, order) : sortRows(visible, sort),
    [visible, order, hasOwnOrder, sort],
  );
  const moved = useMemo(
    () => (hasOwnOrder ? movedCount(rows, applyCityOrder(rows, order)) : 0),
    [rows, order, hasOwnOrder],
  );
  const menuProps = { t, onOpen, onMove, onPin, onExclude };
  const summary = t("next-summary", {
    shown: visible.length,
    total: rows.length,
    high: visible.filter((r) => r.riskTone === "negative").length,
    low: visible.filter((r) => r.cost === "low").length,
    self: visible.filter(
      (r) =>
        r.funding === "self_deliverable" || r.funding === "credit_available",
    ).length,
  });
  const dependsOn = (row: RankedRow) =>
    relatedActions(row.action)
      .filter((r) => r.role === "requires")
      .map((r) => pick(r.action.name, lng));
  const header = (key: string) => (
    <HStack gap="xs" alignItems="center">
      <span>{t(`next-col-${key}`)}</span>
      <MeedInfoTip
        content={t(`next-info-${key}`)}
        ariaLabel={t(`next-info-${key}`)}
      />
    </HStack>
  );

  const levels = (row: RankedRow) => (
    <>
      <Level tone={COST_TONE[row.cost]}>{t(`next-cost-${row.cost}`)}</Level>
      <Level tone={row.legalTone}>{row.legalLabel}</Level>
      <Level tone={GAP_TONE[row.funding]}>{row.fundingLabel}</Level>
      <Level tone={POLICY_TONE[row.policy]}>
        {t(`next-policy-${row.policy}`)}
      </Level>
    </>
  );

  return (
    <VStack alignItems="stretch" gap="m">
      <Box
        bg="base.light"
        borderRadius="rounded"
        boxShadow="1dp"
        overflow="hidden"
      >
        {/* Controls: filters; then what is shown, sort, export, report */}
        <VStack
          alignItems="stretch"
          gap="l"
          px="xl"
          py="l"
          borderBottomWidth="1px"
          borderColor="border.overlay"
        >
          <FilterBar
            rows={rows}
            filters={filters}
            onChange={onFiltersChange}
            lng={lng}
            t={t}
            labels={labels}
          />
          <HStack
            justifyContent="space-between"
            alignItems="flex-start"
            gap="m"
            flexWrap="wrap"
            pt="l"
            borderTopWidth="1px"
            borderColor="border.overlay"
          >
            <VStack alignItems="flex-start" gap="xs" flex="1" minW="260px">
              <BodySmall color="content.primary" fontWeight="semibold">
                {summary}
              </BodySmall>
              <BodySmall color="content.secondary">
                {hasOwnOrder
                  ? t("next-order-note", { count: moved })
                  : t("next-order-hint")}
              </BodySmall>
              <HStack gap="l" pt="xs">
                {hasOwnOrder && (
                  <TextLink arrow={false} onClick={onResetOrder}>
                    {t("next-order-reset")}
                  </TextLink>
                )}
                {onAdjust && (
                  <TextLink onClick={onAdjust}>{t("next-customize")}</TextLink>
                )}
              </HStack>
            </VStack>
            <HStack gap="m" alignItems="flex-start" flexWrap="wrap">
              {!hasOwnOrder && (
                <MenuRoot
                  positioning={{ placement: "bottom-end" }}
                  onSelect={(d) => setSort(d.value as SortKey)}
                >
                  <MenuTrigger asChild>
                    <chakra.button
                      type="button"
                      display="inline-flex"
                      alignItems="center"
                      gap="xs"
                      color="content.link"
                      fontFamily="heading"
                      fontSize="label.md"
                      fontWeight="semibold"
                      _focusVisible={FOCUS_RING}
                    >
                      <span>
                        {t("next-sort-label")}: {t(`next-sort-${sort}`)}
                      </span>
                      <Icon as={LuChevronDown} boxSize="14px" />
                    </chakra.button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuRadioItemGroup value={sort}>
                      {SORT_KEYS.map((k) => (
                        <MenuRadioItem key={k} value={k}>
                          {t(`next-sort-${k}`)}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioItemGroup>
                  </MenuContent>
                </MenuRoot>
              )}
              <MeedButton
                variant="outlined"
                minW="auto"
                px="m"
                leftIcon={<Icon as={LuDownload} boxSize="16px" />}
                onClick={onExportCsv}
                _focusVisible={FOCUS_RING}
              >
                {t("next-export-csv")}
              </MeedButton>
              <ReportControl
                selectedCount={selectedIds.length}
                isGenerating={report.isGenerating}
                onGenerate={report.onGenerate}
                t={tResults}
                hintId="next-report-hint"
              />
            </HStack>
          </HStack>
        </VStack>

        {ordered.length === 0 ? (
          <Box px="xl" py="xl">
            <BodyMedium color="content.secondary">
              {t("next-empty-filtered")}
            </BodyMedium>
          </Box>
        ) : isNarrow ? (
          <VStack alignItems="stretch" gap="0">
            {ordered.map((row) => {
              const name = pick(row.action.name, lng);
              return (
                <VStack
                  key={row.action.id}
                  data-testid="ranked-action"
                  data-action-name={name}
                  alignItems="stretch"
                  gap="m"
                  px="xl"
                  py="l"
                  borderBottomWidth="1px"
                  borderColor="border.overlay"
                >
                  <HStack
                    justifyContent="space-between"
                    alignItems="flex-start"
                    gap="m"
                  >
                    <HStack gap="m" alignItems="flex-start" minW={0}>
                      <SelectActionCheckbox
                        checked={selectedIds.includes(row.action.id)}
                        onToggle={() => onToggleSelect(row.action.id)}
                        ariaLabel={tResults("select-action", { name })}
                      />
                      <VStack alignItems="flex-start" gap="xs" minW={0}>
                        <LabelLarge color="content.primary">{name}</LabelLarge>
                        <Level tone={row.riskTone}>
                          {t("next-addresses", { hazard: row.hazardLabel })} ·{" "}
                          {t("next-addresses-level", {
                            level: t(`risk-level-${row.riskTone}`),
                          })}
                        </Level>
                        {dependsOn(row).length > 0 && (
                          <BodySmall color="content.secondary">
                            {t("next-depends-on", {
                              names: dependsOn(row).join(", "),
                            })}
                          </BodySmall>
                        )}
                      </VStack>
                    </HStack>
                    <RowMenu row={row} name={name} {...menuProps} />
                  </HStack>
                  <HStack gap="l" flexWrap="wrap">
                    {levels(row)}
                  </HStack>
                  <Box alignSelf="flex-start">
                    <TextLink onClick={() => onOpen(row)}>
                      {t("next-view-details")}
                    </TextLink>
                  </Box>
                </VStack>
              );
            })}
          </VStack>
        ) : (
          <Table.Root size="lg">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader w="48px" pl="xl">
                  {tResults("column-select")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>{t("next-col-action")}</Table.ColumnHeader>
                <Table.ColumnHeader w="190px">
                  {header("risk")}
                </Table.ColumnHeader>
                <Table.ColumnHeader w="130px">
                  {header("cost")}
                </Table.ColumnHeader>
                <Table.ColumnHeader w="190px">
                  {header("legal")}
                </Table.ColumnHeader>
                <Table.ColumnHeader w="190px">
                  {header("funding")}
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  w="150px"
                  display={{ base: "none", "2xl": "table-cell" }}
                >
                  {header("policy")}
                </Table.ColumnHeader>
                <Table.ColumnHeader w="96px" pr="xl" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {ordered.map((row) => {
                const name = pick(row.action.name, lng);
                return (
                  <Table.Row
                    key={row.action.id}
                    data-testid="ranked-action"
                    data-action-name={name}
                  >
                    <Table.Cell py="l" pl="xl">
                      <SelectActionCheckbox
                        checked={selectedIds.includes(row.action.id)}
                        onToggle={() => onToggleSelect(row.action.id)}
                        ariaLabel={tResults("select-action", { name })}
                      />
                    </Table.Cell>
                    <Table.Cell py="l">
                      <VStack alignItems="flex-start" gap="xs">
                        <LabelLarge color="content.primary">{name}</LabelLarge>
                        <SectorLabel sector={row.action.sector} size="14px">
                          {row.sectorLabel}
                        </SectorLabel>
                        {dependsOn(row).length > 0 && (
                          <BodySmall color="content.secondary">
                            {t("next-depends-on", {
                              names: dependsOn(row).join(", "),
                            })}
                          </BodySmall>
                        )}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell py="l">
                      <Level tone={row.riskTone}>
                        {row.hazardLabel} · {t(`risk-level-${row.riskTone}`)}
                      </Level>
                    </Table.Cell>
                    <Table.Cell py="l">
                      <Level tone={COST_TONE[row.cost]}>
                        {t(`next-cost-${row.cost}`)}
                      </Level>
                    </Table.Cell>
                    <Table.Cell py="l">
                      <Level tone={row.legalTone}>{row.legalLabel}</Level>
                    </Table.Cell>
                    <Table.Cell py="l">
                      <Level tone={GAP_TONE[row.funding]}>
                        {row.fundingLabel}
                      </Level>
                    </Table.Cell>
                    <Table.Cell
                      py="l"
                      display={{ base: "none", "2xl": "table-cell" }}
                    >
                      <Level tone={POLICY_TONE[row.policy]}>
                        {t(`next-policy-${row.policy}`)}
                      </Level>
                    </Table.Cell>
                    <Table.Cell
                      py="l"
                      pr="xl"
                      textAlign="end"
                      whiteSpace="nowrap"
                    >
                      <HStack gap="xs" justifyContent="flex-end">
                        <IconButton
                          aria-label={tResults("select-action-details", {
                            name,
                          })}
                          size="xs"
                          variant="ghost"
                          onClick={() => onOpen(row)}
                          _focusVisible={FOCUS_RING}
                        >
                          <Icon
                            as={LuSquareArrowOutUpRight}
                            color="content.link"
                          />
                        </IconButton>
                        <RowMenu row={row} name={name} {...menuProps} />
                      </HStack>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        )}
      </Box>

      {unscored.length > 0 && (
        <Collapsible.Root
          open={footnoteOpen}
          onOpenChange={(d) => setFootnoteOpen(d.open)}
        >
          <Collapsible.Trigger asChild>
            <Box
              as="button"
              w="full"
              textAlign="start"
              px="xl"
              py="m"
              borderRadius="rounded"
              _hover={{ bg: "background.neutral" }}
              _focusVisible={FOCUS_RING}
            >
              <HStack justifyContent="space-between" gap="s">
                <LabelLarge color="content.secondary">
                  {t("next-footnote-title", { count: unscored.length })}
                </LabelLarge>
                <Icon
                  as={footnoteOpen ? LuChevronUp : LuChevronDown}
                  boxSize="16px"
                  color="content.tertiary"
                />
              </HStack>
            </Box>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <VStack
              alignItems="stretch"
              gap="0"
              bg="base.light"
              borderRadius="rounded"
              boxShadow="1dp"
              px="xl"
              py="m"
              mt="s"
            >
              <BodySmall color="content.secondary" pb="m">
                {t("next-footnote-body")}
              </BodySmall>
              {unscored.map(({ action, reason }) => (
                <HStack
                  key={action.id}
                  justifyContent="space-between"
                  alignItems="center"
                  gap="m"
                  flexWrap="wrap"
                  py="l"
                  borderTopWidth="1px"
                  borderColor="border.overlay"
                >
                  <VStack
                    alignItems="flex-start"
                    gap="xs"
                    flex="1"
                    minW="240px"
                  >
                    <LabelLarge color="content.primary">
                      {pick(action.name, lng)}
                    </LabelLarge>
                    <BodySmall color="content.secondary">
                      {pick(SECTOR_LABEL[action.sector], lng)} ·{" "}
                      {action.uncoveredHazard
                        ? t("not-ranked-hazard", {
                            hazard: pick(
                              UNCOVERED_HAZARD_LABEL[action.uncoveredHazard],
                              lng,
                            ),
                          })
                        : t(`reason-${reason}`)}
                    </BodySmall>
                  </VStack>
                  {reason === "excluded_by_city" ? (
                    <TextLink
                      arrow={false}
                      onClick={() => onInclude(action.id)}
                    >
                      {t("next-include")}
                    </TextLink>
                  ) : (
                    <TextLink
                      onClick={() => onOpenUnranked({ action, reason })}
                    >
                      {t("next-view-details")}
                    </TextLink>
                  )}
                </HStack>
              ))}
            </VStack>
          </Collapsible.Content>
        </Collapsible.Root>
      )}
    </VStack>
  );
}
