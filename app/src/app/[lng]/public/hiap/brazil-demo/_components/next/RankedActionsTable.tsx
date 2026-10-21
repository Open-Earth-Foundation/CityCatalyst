"use client";
import React, { useMemo, useState } from "react";
import {
  Box,
  chakra,
  Collapsible,
  HStack,
  Icon,
  IconButton,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronDown,
  LuChevronUp,
  LuEllipsisVertical,
  LuPin,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
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
import { ChoiceMenu, ExportCsvButton } from "./ListControls";
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
  /** Opens the preferences panel from the list itself. */
  onAdjust?: () => void;
}) {
  const order = useMemo(() => cityOrder ?? [], [cityOrder]);
  const unscored = notRanked ?? [];
  const hasOwnOrder = order.length > 0;
  const [sort, setSort] = useState<SortKey>("priority");
  const [footnoteOpen, setFootnoteOpen] = useState(false);

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

  return (
    <VStack alignItems="stretch" gap="m">
      <Box
        bg="base.light"
        borderRadius="rounded"
        boxShadow="1dp"
        overflow="hidden"
      >
        {/* Controls: filters; then what is shown, sort, export, report */}
        <VStack alignItems="stretch" gap="l" px="xl" py="l">
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
                <ChoiceMenu
                  label={t("next-sort-label")}
                  value={sort}
                  options={SORT_KEYS.map((k) => ({
                    value: k,
                    label: t(`next-sort-${k}`),
                  }))}
                  onChange={setSort}
                />
              )}
              <ExportCsvButton onClick={onExportCsv} t={t} />
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
      </Box>

      {ordered.length === 0 ? (
        <Box px="xl" py="xl" bg="base.light" borderRadius="rounded">
          <BodyMedium color="content.secondary">
            {t("next-empty-filtered")}
          </BodyMedium>
        </Box>
      ) : (
        <VStack alignItems="stretch" gap="m">
          {/* What each level means, once, aligned with the cards' facts. */}
          <SimpleGrid
            display={{ base: "none", lg: "grid" }}
            columns={5}
            gap="l"
            px="xl"
          >
            {["risk", "cost", "legal", "funding", "policy"].map((key) => (
              <HStack key={key} gap="xs" alignItems="center">
                <Overline color="content.tertiary">
                  {t(`next-col-${key}`)}
                </Overline>
                <MeedInfoTip
                  content={t(`next-info-${key}`)}
                  ariaLabel={t(`next-info-${key}`)}
                />
              </HStack>
            ))}
          </SimpleGrid>
          {ordered.map((row) => {
            const name = pick(row.action.name, lng);
            const selected = selectedIds.includes(row.action.id);
            const deps = dependsOn(row);
            return (
              <Box
                key={row.action.id}
                data-testid="ranked-action"
                data-action-name={name}
                bg="base.light"
                borderWidth="1px"
                borderColor={selected ? "content.link" : "border.neutral"}
                borderRadius="rounded"
                boxShadow="1dp"
                px="xl"
                py="l"
                transition="box-shadow 0.15s, border-color 0.15s"
                _hover={{ boxShadow: "2dp" }}
              >
                <HStack
                  justifyContent="space-between"
                  alignItems="flex-start"
                  gap="m"
                >
                  <HStack gap="m" alignItems="flex-start" minW={0} flex="1">
                    <Box pt="xs">
                      <SelectActionCheckbox
                        checked={selected}
                        onToggle={() => onToggleSelect(row.action.id)}
                        ariaLabel={tResults("select-action", { name })}
                      />
                    </Box>
                    <VStack alignItems="flex-start" gap="xs" minW={0}>
                      <SectorLabel sector={row.action.sector}>
                        {row.sectorLabel}
                      </SectorLabel>
                      <chakra.button
                        type="button"
                        textAlign="start"
                        onClick={() => onOpen(row)}
                        aria-label={tResults("select-action-details", {
                          name,
                        })}
                        _hover={{ "& > *": { color: "content.link" } }}
                        _focusVisible={FOCUS_RING}
                      >
                        <TitleMedium color="content.primary">
                          {name}
                        </TitleMedium>
                      </chakra.button>
                      {deps.length > 0 && (
                        <BodySmall color="content.secondary">
                          {t("next-depends-on", { names: deps.join(", ") })}
                        </BodySmall>
                      )}
                    </VStack>
                  </HStack>
                  <HStack gap="s" flexShrink={0}>
                    <Box display={{ base: "none", md: "block" }}>
                      <TextLink onClick={() => onOpen(row)}>
                        {t("next-view-details")}
                      </TextLink>
                    </Box>
                    <RowMenu row={row} name={name} {...menuProps} />
                  </HStack>
                </HStack>
                <SimpleGrid
                  columns={{ base: 2, md: 3, lg: 5 }}
                  gap="l"
                  mt="l"
                  pt="l"
                  borderTopWidth="1px"
                  borderColor="border.overlay"
                >
                  <Box data-testid="action-risk">
                    <Level tone={row.riskTone} label={t("next-col-risk")}>
                      {t("next-risk-fact", {
                        hazard: row.hazardLabel,
                        level: t(`risk-level-${row.riskTone}`),
                      })}
                    </Level>
                  </Box>
                  <Level tone={COST_TONE[row.cost]} label={t("next-col-cost")}>
                    {t(`next-cost-${row.cost}`)}
                  </Level>
                  <Level tone={row.legalTone} label={t("next-col-legal")}>
                    {row.legalLabel}
                  </Level>
                  <Level
                    tone={GAP_TONE[row.funding]}
                    label={t("next-col-funding")}
                  >
                    {row.fundingLabel}
                  </Level>
                  <Level
                    tone={POLICY_TONE[row.policy]}
                    label={t("next-col-policy")}
                  >
                    {t(`next-policy-${row.policy}`)}
                  </Level>
                </SimpleGrid>
              </Box>
            );
          })}
        </VStack>
      )}

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
                <TitleMedium as="span" color="content.secondary">
                  {t("next-footnote-title", { count: unscored.length })}
                </TitleMedium>
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
                    <TitleMedium as="h3" color="content.primary">
                      {pick(action.name, lng)}
                    </TitleMedium>
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
