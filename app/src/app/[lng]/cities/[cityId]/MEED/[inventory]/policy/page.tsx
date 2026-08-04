"use client";
import React, { useMemo, useState } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  IconButton,
  SimpleGrid,
  Table,
  Tag,
  VStack,
} from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight, LuClipboardList } from "react-icons/lu";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import {
  useGetMeedActionsQuery,
  useGetMeedPolicyScoresQuery,
} from "@/services/api";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { MeedWizardPage } from "../../MeedWizardPage";
import { EmptyState } from "../results/components/EmptyState";
import {
  buildActionIndex,
  type MeedActionIndex,
} from "../results/components/actionCatalog";
import {
  computePolicyAggregates,
  docScope,
  SIGNAL_STRENGTH_NUM,
  type PolicyScope,
} from "./policyAggregates";

// ─── Local view of the Global API action-policy-scores response ──────────────
// (`useGetMeedPolicyScoresQuery` is typed `unknown` — see MeedGlobalApiService.)

interface PolicyEvidence {
  signal_type?: string;
  signal_strength?: string;
  document_name?: string;
  document_type?: string;
  evidence_strength?: number;
}

interface PolicyScore {
  src_action_id: string;
  policy_support_score: number;
  policy_evidence?: PolicyEvidence[];
}

function extractScores(data: unknown): PolicyScore[] {
  if (!data || typeof data !== "object") return [];
  const scores = (data as { scores?: unknown }).scores;
  if (!Array.isArray(scores)) return [];
  return scores.filter(
    (s): s is PolicyScore =>
      !!s &&
      typeof s === "object" &&
      typeof (s as PolicyScore).src_action_id === "string" &&
      typeof (s as PolicyScore).policy_support_score === "number",
  );
}

// ─── Derived per-action rows ──────────────────────────────────────────────────

interface ActionPolicyRow {
  id: string;
  score: number;
  scopeMax: Record<PolicyScope, number | null>;
  evidence: PolicyEvidence[];
}

function evidenceStrengthNum(ev: PolicyEvidence): number {
  return typeof ev.evidence_strength === "number"
    ? ev.evidence_strength
    : (SIGNAL_STRENGTH_NUM[ev.signal_strength ?? ""] ?? 0.2);
}

interface PolicyDerived {
  rows: ActionPolicyRow[];
  planCounts: Record<PolicyScope, number>;
  coverage: Record<PolicyScope, number>;
}

function derivePolicyRows(scores: PolicyScore[]): PolicyDerived {
  const planNames: Record<PolicyScope, Set<string>> = {
    National: new Set(),
    Regional: new Set(),
    Municipal: new Set(),
  };
  const coverage: Record<PolicyScope, number> = {
    National: 0,
    Regional: 0,
    Municipal: 0,
  };

  const rows = scores.map((score) => {
    const scopeMax: Record<PolicyScope, number | null> = {
      National: null,
      Regional: null,
      Municipal: null,
    };
    for (const ev of score.policy_evidence ?? []) {
      const scope = docScope(ev.document_type);
      scopeMax[scope] = Math.max(scopeMax[scope] ?? 0, evidenceStrengthNum(ev));
      if (ev.document_name) planNames[scope].add(ev.document_name);
    }
    for (const scope of ["National", "Regional", "Municipal"] as const) {
      if (scopeMax[scope] !== null) coverage[scope] += 1;
    }
    return {
      id: score.src_action_id,
      score: score.policy_support_score,
      scopeMax,
      evidence: score.policy_evidence ?? [],
    };
  });

  rows.sort((a, b) => b.score - a.score);

  return {
    rows,
    planCounts: {
      National: planNames.National.size,
      Regional: planNames.Regional.size,
      Municipal: planNames.Municipal.size,
    },
    coverage,
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function scoreColorToken(score: number | null): string {
  if (score === null) return "content.tertiary";
  if (score >= 0.75) return "sentiment.positiveDefault";
  if (score >= 0.4) return "sentiment.warningDefault";
  return "content.tertiary";
}

function alignmentLabelKey(score: number | null): string {
  if (score === null) return "alignment-no-plan";
  if (score >= 0.75) return "alignment-strong";
  if (score >= 0.4) return "alignment-moderate";
  return "alignment-limited";
}

const SIGNAL_TYPE_KEYS: Record<string, string> = {
  action: "signal-action",
  funding: "signal-funding",
  governance: "signal-governance",
  sector_priority: "signal-sector",
  target: "signal-target",
};

const STRENGTH_LABEL_KEYS: Record<string, string> = {
  high: "strength-high",
  medium: "strength-medium",
  low: "strength-low",
};

const STRENGTH_PALETTE: Record<string, string> = {
  high: "green",
  medium: "orange",
  low: "gray",
};

const SCOPE_PALETTE: Record<PolicyScope, string> = {
  National: "blue",
  Regional: "orange",
  Municipal: "green",
};

const SCOPE_LABEL_KEYS: Record<PolicyScope, string> = {
  National: "scope-national",
  Regional: "scope-regional",
  Municipal: "scope-municipal",
};

const INITIAL_ROWS = 15;

// ─── Components ───────────────────────────────────────────────────────────────

function ScoreBar({ pct, color }: { pct: number; color: string }) {
  return (
    <Box
      h="6px"
      w="full"
      bg="background.neutral"
      borderRadius="full"
      overflow="hidden"
    >
      <Box h="full" w={`${pct}%`} bg={color} borderRadius="full" />
    </Box>
  );
}

/** Aggregate alignment card for one plan scope (national/regional/municipal). */
function ScopeScoreCard({
  scopeLabel,
  score,
  description,
  t,
}: {
  scopeLabel: string;
  score: number | null;
  description: string;
  t: TFunction;
}) {
  const pct = score !== null ? Math.round(score * 100) : null;
  const color = scoreColorToken(score);
  return (
    <Card.Root>
      <Card.Body p="16px">
        <VStack alignItems="stretch" gap="8px">
          <HStack justifyContent="space-between" alignItems="flex-start">
            <LabelLarge color="content.tertiary">{scopeLabel}</LabelLarge>
            <TitleMedium color={color} fontWeight="bold">
              {pct !== null ? t("percent-value", { value: pct }) : "—"}
            </TitleMedium>
          </HStack>
          <ScoreBar pct={pct ?? 0} color={color} />
          <LabelLarge color={color}>{t(alignmentLabelKey(score))}</LabelLarge>
          <BodyMedium fontSize="xs" color="content.tertiary">
            {description}
          </BodyMedium>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

/** One evidence row shown under an expanded action. */
function EvidenceRow({ ev, t }: { ev: PolicyEvidence; t: TFunction }) {
  const scope = docScope(ev.document_type);
  const strength = (ev.signal_strength ?? "").toLowerCase();
  const strengthKey = STRENGTH_LABEL_KEYS[strength];
  const pct = Math.round(evidenceStrengthNum(ev) * 100);
  const signalKey = SIGNAL_TYPE_KEYS[ev.signal_type ?? ""] ?? "signal-other";

  return (
    <Table.Row bg="background.neutral">
      <Table.Cell colSpan={5}>
        <HStack gap="12px" pl="32px" flexWrap="wrap">
          <BodyMedium color="content.secondary" flex="1" minW="200px">
            {ev.document_name ?? t("unnamed-document")}
          </BodyMedium>
          <Tag.Root colorPalette={SCOPE_PALETTE[scope]} size="sm">
            <Tag.Label>{t(SCOPE_LABEL_KEYS[scope])}</Tag.Label>
          </Tag.Root>
          <BodyMedium fontSize="xs" color="content.tertiary" minW="96px">
            {t(signalKey)}
          </BodyMedium>
          {strengthKey && (
            <Tag.Root
              colorPalette={STRENGTH_PALETTE[strength] ?? "gray"}
              size="sm"
            >
              <Tag.Label>{t(strengthKey)}</Tag.Label>
            </Tag.Root>
          )}
          <BodyMedium
            fontSize="xs"
            color="content.secondary"
            minW="40px"
            textAlign="end"
            fontVariantNumeric="tabular-nums"
          >
            {t("percent-value", { value: pct })}
          </BodyMedium>
        </HStack>
      </Table.Cell>
    </Table.Row>
  );
}

function ScopeCell({ value, t }: { value: number | null; t: TFunction }) {
  return (
    <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
      <BodyMedium
        color={value !== null ? "content.primary" : "content.tertiary"}
      >
        {value !== null
          ? t("percent-value", { value: Math.round(value * 100) })
          : "—"}
      </BodyMedium>
    </Table.Cell>
  );
}

/** One action row with expandable top-evidence detail. */
function ActionRow({
  row,
  index,
  t,
}: {
  row: ActionPolicyRow;
  index: MeedActionIndex;
  t: TFunction;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = row.evidence.length > 0;
  const pct = Math.round(row.score * 100);
  const color = scoreColorToken(row.score);
  const name = index.get(row.id)?.actionName ?? row.id;

  return (
    <>
      <Table.Row>
        <Table.Cell>
          <HStack gap="8px">
            {hasEvidence ? (
              <IconButton
                aria-label={t(expanded ? "collapse-action" : "expand-action")}
                size="2xs"
                variant="ghost"
                onClick={() => setExpanded((v) => !v)}
              >
                <Icon as={expanded ? LuChevronDown : LuChevronRight} />
              </IconButton>
            ) : (
              <Box w="24px" />
            )}
            <BodyMedium color="content.primary">{name}</BodyMedium>
          </HStack>
        </Table.Cell>
        <ScopeCell value={row.scopeMax.National} t={t} />
        <ScopeCell value={row.scopeMax.Regional} t={t} />
        <ScopeCell value={row.scopeMax.Municipal} t={t} />
        <Table.Cell textAlign="end">
          <HStack gap="8px" justifyContent="flex-end">
            <Box w="48px">
              <ScoreBar pct={pct} color={color} />
            </Box>
            <BodyMedium
              color="content.primary"
              fontWeight="semibold"
              minW="40px"
              textAlign="end"
              fontVariantNumeric="tabular-nums"
            >
              {t("percent-value", { value: pct })}
            </BodyMedium>
          </HStack>
        </Table.Cell>
      </Table.Row>
      {expanded &&
        row.evidence.map((ev, i) => (
          <EvidenceRow key={`${row.id}-ev-${i}`} ev={ev} t={t} />
        ))}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function PolicyAlignmentContent(props: { lng: string; cityId: string }) {
  const { lng, cityId } = props;
  const { t } = useTranslation(lng, "meed-policy");

  const { data, isLoading } = useGetMeedPolicyScoresQuery(
    { cityId },
    { skip: !cityId },
  );
  const { data: catalogData } = useGetMeedActionsQuery(
    { cityId },
    { skip: !cityId },
  );

  const [showAll, setShowAll] = useState(false);

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

  if (isLoading) {
    return (
      <Card.Root>
        <Card.Body>
          <BodyLarge color="content.tertiary">{t("loading-policy")}</BodyLarge>
        </Card.Body>
      </Card.Root>
    );
  }

  if (rows.length === 0) {
    return (
      <VStack alignItems="stretch" gap="24px">
        <BodyLarge color="content.secondary">
          {t("policy-description")}
        </BodyLarge>
        <EmptyState
          title={t("no-policy-title")}
          body={t("no-policy-description")}
        />
      </VStack>
    );
  }

  const totalActions = rows.length;
  const visibleRows = showAll ? rows : rows.slice(0, INITIAL_ROWS);

  return (
    <VStack alignItems="stretch" gap="24px">
      <BodyLarge color="content.secondary">{t("policy-description")}</BodyLarge>

      <HStack gap="12px" flexWrap="wrap">
        <Tag.Root colorPalette="green" size="md">
          <Tag.Label>{t("actions-assessed", { n: totalActions })}</Tag.Label>
        </Tag.Root>
        <HStack
          gap="8px"
          bg="background.neutral"
          borderRadius="6px"
          px="12px"
          py="6px"
        >
          <Icon as={LuClipboardList} boxSize="14px" color="content.secondary" />
          <BodyMedium color="content.secondary">
            {t("policy-signal-note", {
              n: planCounts.National,
              r: planCounts.Regional,
              m: planCounts.Municipal,
            })}
          </BodyMedium>
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

      <Card.Root overflow="hidden">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t("column-action")}</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-national")}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-regional")}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-municipal")}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-policy-support")}
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visibleRows.map((row) => (
              <ActionRow key={row.id} row={row} index={actionIndex} t={t} />
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>

      {rows.length > INITIAL_ROWS && (
        <HStack justifyContent="center">
          <CCTerraButton
            variant="text"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? t("show-fewer-actions")
              : t("show-more-actions", { n: rows.length })}
          </CCTerraButton>
        </HStack>
      )}
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="policy">
      <PolicyAlignmentContent lng={lng} cityId={cityId} />
    </MeedWizardPage>
  );
}
