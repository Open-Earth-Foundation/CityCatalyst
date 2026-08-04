"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  HStack,
  Icon,
  SimpleGrid,
  Table,
  VStack,
} from "@chakra-ui/react";
import { LuClipboardList, LuTriangleAlert } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import {
  useGetMeedActionsQuery,
  useGetMeedPolicyScoresQuery,
} from "@/services/api";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { TitleMedium } from "@/components/package/Texts/Title";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MEED_WIZARD_STEPS } from "../../steps";
import { setMeedStepState } from "../../meedLocalState";
import { MeedStatusTag } from "../../components/MeedStatusTag";
import {
  MeedCardSkeleton,
  MeedTableSkeleton,
} from "../../components/MeedSkeletons";
import { EmptyState } from "../results/components/EmptyState";
import { buildActionIndex } from "../results/components/actionCatalog";
import { computePolicyAggregates } from "./policyAggregates";
import { PolicyActionRow } from "./components/PolicyActionRow";
import { PolicyColumnHeader } from "./components/PolicyColumnHeader";
import { ScopeScoreCard } from "./components/ScopeScoreCard";
import {
  derivePolicyRows,
  extractScores,
  POLICY_COLUMN_WIDTHS,
  sortPolicyRows,
  type PolicySortKey,
  type SortDirection,
} from "./policyRows";

const INITIAL_ROWS = 15;

const POLICY_RANKING_WEIGHT =
  MEED_WIZARD_STEPS.find((s) => s.key === "policy")?.rankingWeight ?? 22;

const FOCUS_RING = {
  outline: "2px solid",
  outlineColor: "content.link",
  outlineOffset: "2px",
} as const;

/** Failed fetch, with the only useful next step: try again. */
function PolicyErrorCard({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <Card.Root borderColor="sentiment.negativeDefault">
      <Card.Body>
        <VStack alignItems="flex-start" gap="12px">
          <HStack gap="8px">
            <Icon
              as={LuTriangleAlert}
              boxSize="18px"
              color="sentiment.negativeDefault"
            />
            <TitleMedium color="content.primary">{title}</TitleMedium>
          </HStack>
          <BodyMedium color="content.secondary">{body}</BodyMedium>
          <CCTerraButton
            variant="outlined"
            minW="auto"
            px="20px"
            onClick={onRetry}
            _focusVisible={FOCUS_RING}
          >
            {retryLabel}
          </CCTerraButton>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function PolicyAlignmentContent(props: {
  lng: string;
  cityId: string;
  inventoryId: string;
}) {
  const { lng, cityId, inventoryId } = props;
  const { t } = useTranslation(lng, "meed-policy");

  const { data, isLoading, isError, refetch } = useGetMeedPolicyScoresQuery(
    { cityId },
    { skip: !cityId },
  );
  const { data: catalogData } = useGetMeedActionsQuery(
    { cityId },
    { skip: !cityId },
  );

  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<PolicySortKey>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const scores = useMemo(() => extractScores(data), [data]);
  const aggregates = useMemo(() => computePolicyAggregates(scores), [scores]);
  const { rows, planCounts, coverage } = useMemo(
    () => derivePolicyRows(scores),
    [scores],
  );
  const actionIndex = useMemo(
    () => buildActionIndex(catalogData),
    [catalogData],
  );
  const sortedRows = useMemo(
    () => sortPolicyRows(rows, sortKey, sortDirection),
    [rows, sortKey, sortDirection],
  );

  const totalActions = rows.length;
  const nationalPlans = planCounts.National;

  // Reflect this step on the overview and the pre-flight summary.
  useEffect(() => {
    if (!inventoryId || totalActions === 0) return;
    setMeedStepState(inventoryId, "policy", {
      progress: 100,
      sub: t("policy-step-sub", { n: totalActions, p: nationalPlans }),
    });
  }, [inventoryId, totalActions, nationalPlans, t]);

  const toggleSort = (key: PolicySortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortProps = (key: PolicySortKey, columnLabel: string) => ({
    onSort: () => toggleSort(key),
    active: sortKey === key,
    direction: sortDirection,
    sortAriaLabel: t("sort-by-column", { column: columnLabel }),
  });

  const weightStrip = (
    <HStack
      gap="8px"
      bg="background.neutral"
      borderRadius="rounded"
      px="12px"
      py="6px"
      alignItems="center"
    >
      <Icon as={LuClipboardList} boxSize="14px" color="content.secondary" />
      <Caption color="content.secondary">
        {t("policy-ranking-weight", { weight: POLICY_RANKING_WEIGHT })}
      </Caption>
    </HStack>
  );

  const intro = (
    <VStack alignItems="stretch" gap="8px">
      <BodyLarge color="content.secondary">{t("policy-description")}</BodyLarge>
      {weightStrip}
    </VStack>
  );

  if (isError) {
    return (
      <VStack alignItems="stretch" gap="24px">
        {intro}
        <PolicyErrorCard
          title={t("policy-error-title")}
          body={t("policy-error-body")}
          retryLabel={t("retry")}
          onRetry={() => void refetch()}
        />
      </VStack>
    );
  }

  if (isLoading) {
    return (
      <VStack alignItems="stretch" gap="24px">
        {intro}
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="12px">
          <MeedCardSkeleton lines={2} />
          <MeedCardSkeleton lines={2} />
          <MeedCardSkeleton lines={2} />
        </SimpleGrid>
        <MeedTableSkeleton rows={8} />
      </VStack>
    );
  }

  if (rows.length === 0) {
    return (
      <VStack alignItems="stretch" gap="24px">
        {intro}
        <EmptyState
          title={t("no-policy-title")}
          body={t("no-policy-description")}
        />
      </VStack>
    );
  }

  const visibleRows = showAll ? sortedRows : sortedRows.slice(0, INITIAL_ROWS);
  const [wAction, wNational, wRegional, wMunicipal, wScore] =
    POLICY_COLUMN_WIDTHS;

  return (
    <VStack alignItems="stretch" gap="24px">
      {intro}

      <HStack gap="12px" flexWrap="wrap">
        <MeedStatusTag tone="positive">
          {t("actions-assessed", { n: totalActions })}
        </MeedStatusTag>
        <HStack
          gap="8px"
          bg="background.neutral"
          borderRadius="rounded"
          px="12px"
          py="6px"
        >
          <Icon as={LuClipboardList} boxSize="14px" color="content.secondary" />
          <Caption color="content.secondary">
            {t("policy-signal-note", {
              n: planCounts.National,
              r: planCounts.Regional,
              m: planCounts.Municipal,
            })}
          </Caption>
        </HStack>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="12px">
        <ScopeScoreCard
          scopeLabel={t("national-plan-alignment")}
          score={aggregates.national}
          description={t("national-card-description", {
            n: planCounts.National,
            a: totalActions,
          })}
          t={t}
        />
        <ScopeScoreCard
          scopeLabel={t("regional-plan-alignment")}
          score={aggregates.regional}
          description={t("regional-card-description", {
            n: planCounts.Regional,
            c: coverage.Regional,
            total: totalActions,
          })}
          t={t}
        />
        <ScopeScoreCard
          scopeLabel={t("municipal-plan-alignment")}
          score={aggregates.municipal}
          description={
            planCounts.Municipal > 0
              ? t("municipal-card-description", {
                  n: planCounts.Municipal,
                  c: coverage.Municipal,
                  total: totalActions,
                })
              : t("municipal-none-description")
          }
          t={t}
        />
      </SimpleGrid>

      <VStack alignItems="stretch" gap="4px">
        <TitleMedium color="content.primary">
          {t("actions-table-title")}
        </TitleMedium>
        <BodyMedium color="content.tertiary">
          {t("actions-table-description")}
        </BodyMedium>
      </VStack>

      <Card.Root overflow="hidden" borderColor="border.neutral">
        <Table.Root size="sm" tableLayout="fixed">
          <Table.Header>
            <Table.Row bg="background.neutral">
              <PolicyColumnHeader label={t("column-action")} width={wAction} />
              <PolicyColumnHeader
                label={t("column-national")}
                width={wNational}
                align="end"
                {...sortProps("National", t("column-national"))}
              />
              <PolicyColumnHeader
                label={t("column-regional")}
                width={wRegional}
                align="end"
                {...sortProps("Regional", t("column-regional"))}
              />
              <PolicyColumnHeader
                label={t("column-municipal")}
                width={wMunicipal}
                align="end"
                {...sortProps("Municipal", t("column-municipal"))}
              />
              <PolicyColumnHeader
                label={t("column-policy-support")}
                width={wScore}
                align="end"
                tip={t("policy-support-tip")}
                tipAriaLabel={t("policy-support-tip-label")}
                {...sortProps("score", t("column-policy-support"))}
              />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visibleRows.map((row) => (
              <PolicyActionRow
                key={row.id}
                row={row}
                index={actionIndex}
                t={t}
              />
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>

      <HStack justifyContent="space-between" flexWrap="wrap" gap="8px">
        <Caption>
          {t("sorted-by-note", {
            column: t(
              sortKey === "score"
                ? "column-policy-support"
                : sortKey === "National"
                  ? "column-national"
                  : sortKey === "Regional"
                    ? "column-regional"
                    : "column-municipal",
            ),
            direction: t(
              sortDirection === "desc" ? "sort-descending" : "sort-ascending",
            ),
          })}
        </Caption>
        {rows.length > INITIAL_ROWS && (
          <CCTerraButton
            variant="text"
            onClick={() => setShowAll((v) => !v)}
            _focusVisible={FOCUS_RING}
          >
            {showAll
              ? t("show-fewer-actions")
              : t("show-more-actions", { n: rows.length })}
          </CCTerraButton>
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
    <MeedWizardPage params={props.params} stepKey="policy">
      <PolicyAlignmentContent
        lng={lng}
        cityId={cityId}
        inventoryId={inventory}
      />
    </MeedWizardPage>
  );
}
