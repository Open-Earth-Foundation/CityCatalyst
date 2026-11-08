"use client";
import React, { useMemo, useState } from "react";
import {
  Box,
  chakra,
  Checkbox,
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
  LuCheck,
  LuChevronDown,
  LuChevronUp,
  LuCircleCheck,
  LuEllipsisVertical,
  LuEyeOff,
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
import type { NotRankedReason } from "../../_lib/ranking";
import type { AdaptationAction } from "../../_lib/types";
import type { useLabels } from "../../_lib/useLabels";
import { pick } from "../../_lib/localized";
import { RISK_CELL_BY_KEY } from "../../_lib/riskCells";
import { relatedActions } from "../../_lib/relationships";
import { FilterBar } from "./FilterBar";
import { ExportMenu } from "./ReportControl";
import { Level } from "./Level";
import { SectorGlyph, SectorLabel } from "./SectorIcon";
import { TextLink } from "./TextLink";
import { unrankedShort } from "./unranked";
import { ChoiceMenu, useSearchParam, writeSearchParams } from "./ListControls";
import {
  applyCityOrder,
  COST_TONE,
  GAP_TONE,
  hasActiveFilters,
  matchesFilters,
  movedCount,
  POLICY_TONE,
  SORT_KEYS,
  sortRows,
  type RankedRow,
  type RowFilters,
  type SortKey,
} from "./rows";

/** How many actions open the list as "start with these". */
const START_COUNT = 3;

function RowMenu({
  row,
  name,
  t,
  onOpen,
  onMove,
  onPin,
  onExclude,
  onImplemented,
  isFirst,
  isLast,
}: {
  row: RankedRow;
  name: string;
  /** Position in the city's order, to disable moves that go nowhere. */
  isFirst: boolean;
  isLast: boolean;
  t: TFunction;
  onOpen: (row: RankedRow) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onPin: (id: string) => void;
  onExclude: (id: string) => void;
  onImplemented: (id: string) => void;
}) {
  return (
    <MenuRoot positioning={{ placement: "bottom-end" }}>
      <MenuTrigger asChild>
        <IconButton
          aria-label={t("next-row-menu-aria", { name })}
          size="sm"
          variant="ghost"
          borderRadius="full"
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
        <MenuItem
          value="up"
          disabled={isFirst}
          onClick={() => onMove(row.action.id, -1)}
        >
          <Icon as={LuArrowUp} /> {t("next-move-up")}
        </MenuItem>
        <MenuItem
          value="down"
          disabled={isLast}
          onClick={() => onMove(row.action.id, 1)}
        >
          <Icon as={LuArrowDown} /> {t("next-move-down")}
        </MenuItem>
        <MenuItem
          value="pin"
          disabled={isFirst}
          onClick={() => onPin(row.action.id)}
        >
          <Icon as={LuPin} /> {t("next-pin-top")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          value="implemented"
          onClick={() => onImplemented(row.action.id)}
        >
          <Icon as={LuCircleCheck} /> {t("next-mark-implemented")}
        </MenuItem>
        <MenuItem value="exclude" onClick={() => onExclude(row.action.id)}>
          <Icon as={LuEyeOff} /> {t("next-exclude")}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}

/** A quiet heading inside the list: a title, a rule, and one optional line. */
function GroupHeading({
  title,
  body,
  testId,
}: {
  title: string;
  body?: string;
  testId?: string;
}) {
  return (
    <VStack alignItems="stretch" gap="xs" pt="s" data-testid={testId}>
      <HStack gap="m" alignItems="center">
        <TitleMedium as="h3" color="content.primary" flexShrink={0}>
          {title}
        </TitleMedium>
        <Box flex="1" h="1px" bg="border.neutral" />
      </HStack>
      {body && <BodySmall color="content.secondary">{body}</BodySmall>}
    </VStack>
  );
}

/** A collapsed group at the end of the list (implemented, left out). */
function SetAside({
  title,
  testId,
  items,
  actionLabel,
  onAction,
  lng,
}: {
  title: string;
  testId: string;
  items: AdaptationAction[];
  actionLabel: string;
  onAction: (id: string) => void;
  lng: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(d) => setOpen(d.open)}
      data-testid={testId}
    >
      <Collapsible.Trigger asChild>
        <chakra.button
          type="button"
          w="full"
          textAlign="start"
          px="xl"
          py="m"
          borderRadius="rounded"
          borderWidth="1px"
          borderStyle="dashed"
          borderColor="border.neutral"
          _hover={{ bg: "background.neutral" }}
          _focusVisible={FOCUS_RING}
        >
          <HStack justifyContent="space-between" gap="s">
            <TitleMedium as="span" color="content.secondary">
              {title}
            </TitleMedium>
            <Icon
              as={open ? LuChevronUp : LuChevronDown}
              boxSize="16px"
              color="content.tertiary"
            />
          </HStack>
        </chakra.button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <VStack
          alignItems="stretch"
          gap="0"
          bg="base.light"
          borderRadius="rounded"
          borderWidth="1px"
          borderColor="border.neutral"
          px="xl"
          mt="s"
        >
          {items.map((action, i) => (
            <HStack
              key={action.id}
              justifyContent="space-between"
              alignItems="center"
              gap="m"
              flexWrap="wrap"
              py="m"
              borderTopWidth={i === 0 ? "0" : "1px"}
              borderColor="border.overlay"
            >
              <HStack gap="s" minW={0} flex="1">
                <SectorGlyph sector={action.sector} size="16px" />
                <BodyMedium color="content.primary">
                  {pick(action.name, lng)}
                </BodyMedium>
              </HStack>
              <TextLink arrow={false} onClick={() => onAction(action.id)}>
                {actionLabel}
              </TextLink>
            </HStack>
          ))}
        </VStack>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/**
 * BR-N1's one list of actions, in order. The order is the result: no rank,
 * band or label. The controls cluster sits at its head (shortcuts, filters,
 * preferences); then one bar to select all, sort and export; then the first
 * three actions as "start with these", and the rest. Actions the city marked
 * as implemented, or left out, wait in collapsed groups at the end.
 */
export function RankedActionsTable({
  rows,
  cityOrder,
  reasonOf,
  filters,
  onFiltersChange,
  orderControls,
  lng,
  t,
  tResults,
  labels,
  selectedIds,
  onToggleSelect,
  onSelectMany,
  onOpen,
  implemented,
  leftOut,
  onImplemented,
  onUnimplemented,
  onExclude,
  onInclude,
  onMove,
  onPin,
  onResetOrder,
  onExportCsv,
  onExportPdf,
  isGenerating,
  savedAt,
  onOpenAction,
  cityName,
}: {
  /** Ranked rows still on the list, in suggested order. */
  rows: RankedRow[];
  cityOrder?: string[];
  /** Why an action is outside the ranking, for the "Depends on" line. */
  reasonOf: (id: string) => NotRankedReason | null;
  filters: RowFilters;
  onFiltersChange: (next: RowFilters) => void;
  /** The preferences row of the controls. */
  orderControls: React.ReactNode;
  lng: string;
  t: TFunction;
  tResults: TFunction;
  labels: ReturnType<typeof useLabels>;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  /** Replaces the selection (select all / clear). */
  onSelectMany: (ids: string[]) => void;
  onOpen: (row: RankedRow) => void;
  /** Actions marked as already implemented, and those the city left out. */
  implemented: AdaptationAction[];
  leftOut: AdaptationAction[];
  onImplemented: (id: string) => void;
  onUnimplemented: (id: string) => void;
  onExclude: (id: string) => void;
  onInclude: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onPin: (id: string) => void;
  onResetOrder: () => void;
  /** Exports the list as shown, in this order. */
  onExportCsv: (ordered: RankedRow[]) => void;
  onExportPdf: () => void;
  isGenerating: boolean;
  /** When the city's changes were last kept in this browser. */
  savedAt: string | null;
  /** Opens any action's detail by id, for the "Depends on" links. */
  onOpenAction: (id: string) => void;
  cityName: string;
}) {
  const order = useMemo(() => cityOrder ?? [], [cityOrder]);
  const hasOwnOrder = order.length > 0;
  // Sort lives in the URL, like the filters, so it survives a reload.
  const urlSort = useSearchParam("sort");
  const [sortState, setSortState] = useState<SortKey | null>(null);
  const sort: SortKey =
    sortState ??
    (SORT_KEYS.includes(urlSort as SortKey)
      ? (urlSort as SortKey)
      : "priority");
  const setSort = (k: SortKey) => {
    setSortState(k);
    writeSearchParams({ sort: k === "priority" ? null : k });
  };
  // The last action marked as implemented, so the move can be undone in place.
  const [justImplemented, setJustImplemented] = useState<string | null>(null);

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
  // Moves act on the city's whole order, not on the filtered view.
  const fullOrder = useMemo(
    () =>
      (hasOwnOrder ? applyCityOrder(rows, order) : rows).map(
        (r) => r.action.id,
      ),
    [rows, order, hasOwnOrder],
  );
  const markImplemented = (id: string) => {
    setJustImplemented(id);
    onImplemented(id);
  };
  const menuProps = {
    t,
    onOpen,
    onMove,
    onPin,
    onExclude,
    onImplemented: markImplemented,
  };
  // The first three open the list only when it shows the whole order.
  const grouped =
    !hasActiveFilters(filters) &&
    (hasOwnOrder || sort === "priority") &&
    ordered.length > START_COUNT;

  const shownIds = ordered.map((r) => r.action.id);
  const selectedShown = shownIds.filter((id) => selectedIds.includes(id));
  const allChecked =
    selectedShown.length === 0
      ? false
      : selectedShown.length === shownIds.length
        ? true
        : ("indeterminate" as const);
  const toggleAll = () =>
    onSelectMany(
      allChecked === true
        ? selectedIds.filter((id) => !shownIds.includes(id))
        : Array.from(new Set([...selectedIds, ...shownIds])),
    );
  const exportCount = selectedIds.filter((id) =>
    rows.some((r) => r.action.id === id),
  ).length;

  // A prerequisite opens on click, and one outside the ranking says why.
  const dependsOn = (row: RankedRow) =>
    relatedActions(row.action)
      .filter((r) => r.role === "requires")
      .map((r) => {
        const reason = reasonOf(r.action.id);
        return {
          id: r.action.id,
          name: pick(r.action.name, lng),
          aside: reason ? unrankedShort(r.action, reason, lng, t) : null,
        };
      });
  const undoName = justImplemented
    ? implemented.find((a) => a.id === justImplemented)
    : undefined;

  const card = (row: RankedRow) => {
    const name = pick(row.action.name, lng);
    const selected = selectedIds.includes(row.action.id);
    const deps = dependsOn(row);
    const hazardSector = row.hazard
      ? RISK_CELL_BY_KEY[row.hazard].sector
      : null;
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
        px={{ base: "l", md: "xl" }}
        py="l"
        transition="box-shadow 0.15s, border-color 0.15s"
        _hover={{ boxShadow: "2dp" }}
      >
        <HStack justifyContent="space-between" alignItems="flex-start" gap="m">
          <HStack gap="m" alignItems="flex-start" minW={0} flex="1">
            <Box pt="xs">
              <SelectActionCheckbox
                checked={selected}
                onToggle={() => onToggleSelect(row.action.id)}
                ariaLabel={t("next-select-action", { name })}
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
                aria-label={tResults("select-action-details", { name })}
                _hover={{ "& > *": { color: "content.link" } }}
                _focusVisible={FOCUS_RING}
              >
                <TitleMedium as="span" display="block" color="content.primary">
                  {name}
                </TitleMedium>
              </chakra.button>
              {deps.length > 0 && (
                <BodySmall color="content.secondary">
                  {t("next-depends-on-label")}{" "}
                  {deps.map((d, i) => (
                    <React.Fragment key={d.id}>
                      {i > 0 && ", "}
                      <chakra.button
                        type="button"
                        textAlign="start"
                        color="content.link"
                        textDecoration="underline"
                        textUnderlineOffset="2px"
                        onClick={() => onOpenAction(d.id)}
                        _hover={{ textDecoration: "none" }}
                        _focusVisible={FOCUS_RING}
                      >
                        {d.name}
                      </chakra.button>
                      {d.aside && ` (${d.aside})`}
                    </React.Fragment>
                  ))}
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
            <RowMenu
              row={row}
              name={name}
              isFirst={fullOrder[0] === row.action.id}
              isLast={fullOrder[fullOrder.length - 1] === row.action.id}
              {...menuProps}
            />
          </HStack>
        </HStack>
        <SimpleGrid
          columns={2}
          // Columns follow the list's width, not the window's.
          css={{
            "@container (min-width: 640px)": {
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            },
            "@container (min-width: 1000px)": {
              gridTemplateColumns: "1.5fr repeat(4, minmax(0, 1fr))",
            },
          }}
          alignItems="end"
          gap="l"
          mt="l"
          pt="l"
          borderTopWidth="1px"
          borderColor="border.overlay"
        >
          {/* The colour is the city's risk level for the hazard, not a
              verdict on the action: the hazard is named next to it. */}
          <Box
            data-testid="action-risk"
            css={{
              gridColumn: "1 / -1",
              "@container (min-width: 640px)": { gridColumn: "auto" },
            }}
          >
            <Overline color="content.tertiary" mb="xs">
              {t("next-col-risk")}
            </Overline>
            <VStack alignItems="flex-start" gap="xs">
              <HStack gap="xs" alignItems="flex-start">
                {hazardSector && (
                  <Box pt="2px">
                    <SectorGlyph sector={hazardSector} />
                  </Box>
                )}
                <BodySmall color="content.primary" fontWeight="semibold">
                  {row.hazardLabel}
                </BodySmall>
              </HStack>
              <Level tone={row.riskTone}>
                {t(`next-risk-level-${row.riskTone}`)}
              </Level>
            </VStack>
          </Box>
          <Level tone={COST_TONE[row.cost]} label={t("next-col-cost")}>
            {t(`next-cost-${row.cost}`)}
          </Level>
          <Level tone={row.legalTone} label={t("next-col-legal")}>
            {row.legalLabel}
          </Level>
          <Level tone={GAP_TONE[row.funding]} label={t("next-col-funding")}>
            {row.fundingLabel}
          </Level>
          <Level tone={POLICY_TONE[row.policy]} label={t("next-col-policy")}>
            {t(`next-policy-${row.policy}`)}
          </Level>
        </SimpleGrid>
      </Box>
    );
  };

  return (
    <VStack alignItems="stretch" gap="m">
      {/* One controls cluster: shortcuts, filters, preferences. */}
      <Box
        bg="base.light"
        borderRadius="rounded"
        borderWidth="1px"
        borderColor="border.neutral"
        px={{ base: "l", md: "xl" }}
        py="l"
        data-testid="list-controls"
      >
        <FilterBar
          rows={rows}
          filters={filters}
          onChange={onFiltersChange}
          lng={lng}
          t={t}
          labels={labels}
          orderControls={orderControls}
        />
      </Box>

      {/* The list bar: select all, count and order; saved state and export. */}
      <HStack
        justifyContent="space-between"
        alignItems="center"
        gap="m"
        rowGap="s"
        flexWrap="wrap"
        px={{ base: "l", md: "xl" }}
        py="s"
        data-testid="list-bar"
      >
        <HStack gap="l" rowGap="s" flexWrap="wrap" alignItems="center">
          <Checkbox.Root
            checked={allChecked}
            onCheckedChange={toggleAll}
            disabled={shownIds.length === 0}
            cursor="pointer"
            display="inline-flex"
            alignItems="center"
            gap="s"
          >
            <Checkbox.HiddenInput aria-label={t("next-select-all-actions")} />
            <Checkbox.Control
              borderWidth="1px"
              borderColor="border.neutral"
              bg="base.light"
              _checked={{
                bg: "content.link",
                borderColor: "content.link",
                color: "base.light",
              }}
              _indeterminate={{
                bg: "content.link",
                borderColor: "content.link",
                color: "base.light",
              }}
              _focusVisible={FOCUS_RING}
            >
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label
              fontFamily="heading"
              fontSize="label.md"
              fontWeight="semibold"
              color="content.primary"
            >
              {selectedShown.length > 0
                ? t("next-selected-count", { count: selectedShown.length })
                : t("next-select-all")}
            </Checkbox.Label>
          </Checkbox.Root>
          <BodySmall color="content.secondary">
            {t("next-summary-shown", {
              shown: visible.length,
              total: rows.length,
            })}
          </BodySmall>
          {hasOwnOrder ? (
            <HStack gap="m" flexWrap="wrap">
              <BodySmall color="content.primary" fontWeight="semibold">
                {t("next-order-note", { count: moved })}
              </BodySmall>
              <TextLink arrow={false} onClick={onResetOrder}>
                {t("next-order-reset")}
              </TextLink>
            </HStack>
          ) : (
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
        </HStack>
        <HStack
          gap="m"
          rowGap="s"
          flexWrap="wrap"
          alignItems="center"
          ml="auto"
        >
          {savedAt && (
            <HStack gap="xs" data-testid="saved-hint" aria-live="polite">
              <Icon as={LuCheck} boxSize="14px" color="content.tertiary" />
              <BodySmall color="content.tertiary">
                {t("next-saved-device")}
              </BodySmall>
            </HStack>
          )}
          <ExportMenu
            selectedCount={exportCount}
            isGenerating={isGenerating}
            onPdf={onExportPdf}
            onCsv={() => onExportCsv(ordered)}
            t={t}
          />
        </HStack>
      </HStack>

      {undoName && (
        <HStack
          gap="m"
          flexWrap="wrap"
          px={{ base: "l", md: "xl" }}
          py="s"
          bg="background.neutral"
          borderRadius="rounded"
          aria-live="polite"
        >
          <BodySmall color="content.primary">
            {t("next-implemented-moved", { name: pick(undoName.name, lng) })}
          </BodySmall>
          <TextLink
            arrow={false}
            onClick={() => {
              onUnimplemented(undoName.id);
              setJustImplemented(null);
            }}
          >
            {t("next-undo")}
          </TextLink>
        </HStack>
      )}

      {ordered.length === 0 ? (
        <Box px="xl" py="xl" bg="base.light" borderRadius="rounded">
          <BodyMedium color="content.secondary">
            {t("next-empty-filtered")}
          </BodyMedium>
        </Box>
      ) : (
        <VStack alignItems="stretch" gap="m" containerType="inline-size">
          {/* What each fact means, once, aligned with the cards' facts:
              only when the list is wide enough for five columns. */}
          <SimpleGrid
            display="none"
            gap="l"
            px="xl"
            css={{
              "@container (min-width: 1000px)": {
                display: "grid",
                gridTemplateColumns: "1.5fr repeat(4, minmax(0, 1fr))",
              },
            }}
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
          {grouped ? (
            <>
              <GroupHeading
                title={t("next-start-title")}
                body={t("next-start-body", { city: cityName })}
                testId="start-with"
              />
              {ordered.slice(0, START_COUNT).map(card)}
              <GroupHeading
                title={t("next-rest-title", {
                  count: ordered.length - START_COUNT,
                })}
              />
              {ordered.slice(START_COUNT).map(card)}
            </>
          ) : (
            ordered.map(card)
          )}
        </VStack>
      )}

      <SetAside
        title={t("next-implemented-title", { count: implemented.length })}
        testId="implemented-group"
        items={implemented}
        actionLabel={t("next-implemented-undo")}
        onAction={onUnimplemented}
        lng={lng}
      />
      <SetAside
        title={t("next-left-out-title", { count: leftOut.length })}
        testId="left-out-group"
        items={leftOut}
        actionLabel={t("next-include")}
        onAction={onInclude}
        lng={lng}
      />
    </VStack>
  );
}
