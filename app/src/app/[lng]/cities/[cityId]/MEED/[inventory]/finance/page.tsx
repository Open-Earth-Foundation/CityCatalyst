"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, HStack, Icon, Table, VStack } from "@chakra-ui/react";
import { LuCoins } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import {
  useGetCityQuery,
  useGetMeedFinanceFeasibilityQuery,
} from "@/services/api";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "../../components/MeedButton";
import { pillarPercent } from "../../scoringWeights";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MEED_WIZARD_STEPS } from "../../steps";
import { setMeedStepState } from "../../meedLocalState";
import {
  MeedCardSkeleton,
  MeedTableSkeleton,
} from "../../components/MeedSkeletons";
import { MeedErrorCard } from "../../components/MeedErrorCard";
import { EmptyState } from "../results/components/EmptyState";
import { CityProfileCard } from "./components/CityProfileCard";
import { FeasibilityRow } from "./components/FeasibilityRow";
import { FinanceColumnHeader } from "./components/FinanceColumnHeader";
import { RouteFilterChips } from "./components/RouteFilterChips";
import {
  countSelfDeliverable,
  FINANCE_COLUMN_WIDTHS,
  FOCUS_RING,
  profileAttrs,
  routeKeyOf,
  sortByFeasibility,
  type RouteKey,
  type SortDirection,
} from "./labels";
import { extractFeasibilityRows } from "./types";

const INITIAL_ROWS = 15;
const TABLE_ID = "meed-finance-table";

const FINANCE_RANKING_WEIGHT = pillarPercent("feasibility");

function FinancialFeasibilityContent(props: {
  lng: string;
  cityId: string;
  inventoryId: string;
}) {
  const { lng, cityId, inventoryId } = props;
  const { t } = useTranslation(lng, "meed-finance");

  const { data, isLoading, isError, refetch } =
    useGetMeedFinanceFeasibilityQuery({ cityId }, { skip: !cityId });
  const { data: city } = useGetCityQuery(cityId, { skip: !cityId });

  const [activeRoute, setActiveRoute] = useState<RouteKey | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const rows = useMemo(() => extractFeasibilityRows(data), [data]);

  const routeCounts = useMemo(() => {
    const counts: Partial<Record<RouteKey, number>> = {};
    for (const row of rows) {
      const key = routeKeyOf(row.route);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const base = activeRoute
      ? rows.filter((row) => routeKeyOf(row.route) === activeRoute)
      : rows;
    return sortByFeasibility(base, sortDirection);
  }, [rows, activeRoute, sortDirection]);

  const cityName = city?.name ?? t("the-city");
  const totalActions = rows.length;
  const selfCount = useMemo(() => countSelfDeliverable(rows), [rows]);

  // Reflect this step on the overview and the pre-flight summary.
  useEffect(() => {
    if (!inventoryId || totalActions === 0) return;
    setMeedStepState(inventoryId, "finance", {
      progress: 100,
      sub: t("finance-step-sub", { n: totalActions, s: selfCount }),
    });
  }, [inventoryId, totalActions, selfCount, t]);

  const weightStrip = (
    <HStack
      gap="s"
      bg="background.neutral"
      borderRadius="rounded"
      px="m"
      py="s"
      alignItems="center"
    >
      <Icon as={LuCoins} boxSize="14px" color="content.secondary" />
      <Caption color="content.secondary">
        {t("finance-ranking-weight", { weight: FINANCE_RANKING_WEIGHT })}
      </Caption>
    </HStack>
  );

  const intro = (
    <VStack alignItems="stretch" gap="s">
      <BodyLarge color="content.secondary">
        {t("finance-description", { city: cityName })}
      </BodyLarge>
      {weightStrip}
    </VStack>
  );

  if (isError) {
    return (
      <VStack alignItems="stretch" gap="l">
        {intro}
        <MeedErrorCard
          title={t("finance-error-title")}
          body={t("finance-error-body")}
          retryLabel={t("retry")}
          onRetry={() => void refetch()}
        />
      </VStack>
    );
  }

  if (isLoading) {
    return (
      <VStack alignItems="stretch" gap="l">
        {intro}
        <MeedCardSkeleton lines={4} />
        <MeedTableSkeleton rows={8} />
      </VStack>
    );
  }

  if (rows.length === 0) {
    return (
      <VStack alignItems="stretch" gap="l">
        {intro}
        <EmptyState
          title={t("no-finance-title")}
          body={t("no-finance-description")}
        />
      </VStack>
    );
  }

  const visibleRows = showAll ? filtered : filtered.slice(0, INITIAL_ROWS);
  const [wAction, wSector, wRoute, wScore, wFunds] = FINANCE_COLUMN_WIDTHS;

  return (
    <VStack alignItems="stretch" gap="l">
      {intro}

      <CityProfileCard
        cityName={cityName}
        profile={profileAttrs(rows[0]?.inputs?.city?.profile)}
        t={t}
      />

      <VStack alignItems="stretch" gap="xs">
        <TitleMedium color="content.primary">{t("table-title")}</TitleMedium>
        <BodyMedium color="content.tertiary">
          {t("table-description")}
        </BodyMedium>
      </VStack>

      <RouteFilterChips
        active={activeRoute}
        onChange={setActiveRoute}
        counts={routeCounts}
        totalCount={rows.length}
        controls={TABLE_ID}
        ariaLabel={t("route-filter-label")}
        t={t}
      />

      <Card.Root overflow="hidden" borderColor="border.neutral">
        <Table.Root id={TABLE_ID} size="md" tableLayout="fixed">
          <Table.Header>
            <Table.Row bg="background.neutral">
              <FinanceColumnHeader label={t("column-action")} width={wAction} />
              <FinanceColumnHeader label={t("column-sector")} width={wSector} />
              <FinanceColumnHeader label={t("column-route")} width={wRoute} />
              <FinanceColumnHeader
                label={t("column-score")}
                width={wScore}
                align="end"
                onSort={() =>
                  setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
                }
                active
                direction={sortDirection}
                sortAriaLabel={t("sort-by-column", {
                  column: t("column-score"),
                })}
                tip={t("score-tip")}
                tipAriaLabel={t("score-tip-label")}
              />
              <FinanceColumnHeader
                label={t("column-fund-access")}
                width={wFunds}
                align="end"
                tip={t("fund-access-tip")}
                tipAriaLabel={t("fund-access-tip-label")}
              />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visibleRows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <BodyMedium color="content.tertiary" textAlign="center">
                    {t("no-route-matches")}
                  </BodyMedium>
                </Table.Cell>
              </Table.Row>
            ) : (
              visibleRows.map((row) => (
                <FeasibilityRow
                  key={row.action_id}
                  row={row}
                  expanded={expandedId === row.action_id}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === row.action_id ? null : row.action_id,
                    )
                  }
                  cityId={cityId}
                  cityName={cityName}
                  t={t}
                />
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Card.Root>

      <HStack justifyContent="space-between" flexWrap="wrap" gap="s">
        <Caption>
          {t("sorted-by-note", {
            direction: t(
              sortDirection === "desc" ? "sort-descending" : "sort-ascending",
            ),
          })}
        </Caption>
        {filtered.length > INITIAL_ROWS && (
          <MeedButton
            variant="text"
            onClick={() => setShowAll((v) => !v)}
            _focusVisible={FOCUS_RING}
          >
            {showAll
              ? t("show-fewer-actions")
              : t("show-more-actions", { n: filtered.length })}
          </MeedButton>
        )}
      </HStack>
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="finance">
      <FinancialFeasibilityContent
        lng={lng}
        cityId={cityId}
        inventoryId={inventory}
      />
    </MeedWizardPage>
  );
}
