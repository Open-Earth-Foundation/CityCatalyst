"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import { api, useGetMeedActionsQuery } from "@/services/api";
import { formatEmissions } from "@/util/helpers";
import type {
  MeedPrioritizeCityResult,
  MeedRankedActionResult,
} from "@/util/types/meed";
import { MeedShell } from "../../components/MeedShell";
import { useMeedSectionStates } from "../../meedStatus";
import { stepHref } from "../../navigation";
import { EmptyState } from "./components/EmptyState";
import { FullRanking } from "./components/FullRanking";
import { DetailPanel, type ScoreWeights } from "./components/DetailPanel";
import { ResultsHeader } from "./components/ResultsHeader";
import { TopPicks } from "./components/TopPicks";
import { CoBenefitStrip } from "./components/CoBenefitStrip";
import { ContextCardGrid } from "./components/ContextCardGrid";
import type { MeedContextArea } from "./components/contextAreas";
import { MeedScoreLegend } from "../../components/MeedScoreComposition";
import { MeedRankingSummary } from "../../components/MeedRankingSummary";
import { MeedRankingConfig } from "../../components/MeedRankingConfig";
import { rankingInsights } from "./components/rankingInsights";
import { sectorTagLabel } from "./components/actionCatalog";
import { SECTORS } from "@/util/constants";
import { meedContextVisual } from "../../components/meedContextVisuals";
import { useMeedContextFacts } from "../../useMeedContextFacts";
import { buildActionIndex } from "./components/actionCatalog";
import { buildRankingCsv } from "./components/rankingCsv";
import { downloadCsv } from "@/util/csv";
import { useMeedRanking } from "../../useMeedRanking";
import { tallyCoBenefits } from "./components/coBenefits";
import {
  excludedActionCount,
  legalFunnel,
  policyBacking,
  readRankingWeights,
} from "./components/rankingFacts";
import { PILLAR_WEIGHTS } from "../../scoringWeights";
import { MeedCardSkeleton } from "../../components/MeedSkeletons";
import { MeedErrorCard } from "../../components/MeedErrorCard";
import {
  MeedReportBlockedError,
  useMeedReport,
  type MeedReportResult,
} from "./report/useMeedReport";
import { buildReportPdf } from "./report/meedReportPdf";
import { actionName as catalogActionName } from "./components/actionCatalog";

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  const { t } = useTranslation(lng, "meed-results");
  const { t: tContext } = useTranslation(lng, "meed-context");
  const router = useRouter();
  const sectorLabelFor = useCallback(
    (name: string) => t(`sector-short-${name}`),
    [t],
  );

  // Read through the shared hook so this screen and the landing screen can
  // never disagree about whether a ranking exists.
  const { states, isReady: statesReady } = useMeedSectionStates(inventoryId);
  const {
    ranking: stored,
    isReady: rankingReady,
    isStale,
    isError: rankingError,
  } = useMeedRanking(inventoryId, states);
  const ranking: MeedPrioritizeCityResult | null = stored?.result ?? null;

  // Both stores are read in effects, so on the first client render they are
  // still empty. Without this the screen renders "no ranking generated yet" for
  // a frame on every visit to a populated results page — and `isStale` compares
  // against an empty state, so the stale banner flashes too.
  const isReady = rankingReady && statesReady;

  // The weights the backend actually scored with, so the printed formula in the
  // detail drawer matches the final score beside it.
  const scoreWeights: ScoreWeights = useMemo(
    () => readRankingWeights(ranking, PILLAR_WEIGHTS),
    [ranking],
  );
  const [selected, setSelected] = useState<MeedRankedActionResult | null>(null);

  // One selection, shared by the top-pick cards and the ranking rows, feeding
  // the single "Generate report" button in the header.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = useCallback((actionId: string) => {
    setSelectedIds((previous) =>
      previous.includes(actionId)
        ? previous.filter((id) => id !== actionId)
        : [...previous, actionId],
    );
  }, []);

  const rankingRef = useRef<HTMLDivElement | null>(null);
  const showFullRanking = useCallback(() => {
    rankingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const { data: catalog, isLoading: isCatalogLoading } = useGetMeedActionsQuery(
    {
      cityId,
    },
  );
  const index = useMemo(() => buildActionIndex(catalog), [catalog]);

  const { data: inventory } = api.useGetInventoryQuery(inventoryId, {
    skip: !inventoryId,
  });

  const ranked = useMemo(() => ranking?.ranked_actions ?? [], [ranking]);
  const topPicks = useMemo(() => ranked.slice(0, 3), [ranked]);
  const excludedCount = excludedActionCount(ranking);
  const backing = useMemo(() => policyBacking(ranked), [ranked]);
  const coBenefits = useMemo(
    () => tallyCoBenefits(topPicks, index),
    [topPicks, index],
  );

  const emissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : undefined;
  // `unit` already carries the CO₂e suffix (e.g. "MtCO₂e").
  const emissionsText = emissions
    ? `${emissions.value} ${emissions.unit}`.trim()
    : undefined;

  // The city and inventory year live on this screen, not in the table, so the
  // file is named here and the table stays presentational. Either part may be
  // missing while the inventory query is still in flight — the name simply
  // drops it rather than writing "undefined" into the filename.
  const exportRanking = useCallback(() => {
    if (ranked.length === 0) return;
    const { headers, rows } = buildRankingCsv(ranked, index, t);
    const parts = [
      inventory?.city?.name,
      inventory?.year,
      "meed_ranked_actions",
    ].filter(
      (part): part is string | number =>
        part !== null && part !== undefined && part !== "",
    );
    downloadCsv({
      filename: `${parts.join("_").replace(/\s+/g, "_")}.csv`,
      headers,
      rows,
    });
  }, [ranked, index, t, inventory]);

  const { generate, isRunning, progress } = useMeedReport(cityId, inventoryId);
  // Carries its own title: "some reports could not be generated" is the wrong
  // heading for a run that never got as far as generating anything.
  const [reportError, setReportError] = useState<{
    title: string;
    body: string;
    /** Present when there is somewhere to go to unblock the run. */
    action?: { label: string; href: string };
  } | null>(null);

  const generateReport = useCallback(async () => {
    setReportError(null);
    const targets = selectedIds.map((actionId) => ({
      actionId,
      actionName: catalogActionName(index, actionId, t),
    }));

    let result: MeedReportResult | null;
    try {
      result = await generate(targets, lng);
    } catch (error) {
      // The run never started, so the instruction is not "try again". A
      // missing snapshot in particular is fixed by re-running the ranking —
      // the ranking on screen may predate reports entirely.
      const blocked =
        error instanceof MeedReportBlockedError &&
        error.reason === "no-snapshot"
          ? "snapshot"
          : "fetch";
      setReportError({
        title: t(`report-error-${blocked}-title`),
        body: t(`report-error-${blocked}`),
        action:
          blocked === "snapshot"
            ? {
                label: t("report-error-snapshot-action"),
                href: stepHref(
                  lng,
                  cityId,
                  inventoryId,
                  "preflight",
                  "results",
                ),
              }
            : undefined,
      });
      return;
    }

    // `null` means a run was already in flight. The first run owns the
    // outcome; overwriting it here would put "no reports" on screen while
    // that run is still working, and leave it there once it succeeds.
    if (!result) return;

    if (result.documents.length === 0) {
      setReportError({
        title: t("report-error-title"),
        body: t("report-error-none"),
      });
      return;
    }
    // A short report with no explanation is worse than a named omission.
    if (result.failed.length > 0) {
      setReportError({
        title: t("report-error-title"),
        body: t("report-error-partial", {
          count: result.failed.length,
          actions: result.failed.join(", "),
        }),
      });
    }

    const { documents } = result;
    const pdf = await buildReportPdf(documents, {
      title: t("report-title"),
      cityName: inventory?.city?.name ?? "",
      subtitle: t("report-subtitle", { count: documents.length }),
      limitationsLabel: t("report-limitations"),
      generatedBy: t("report-footer-generated-by"),
      generatedOn: `${t("report-footer-generated-on")} ${new Date().toLocaleDateString(lng)}`,
      pageLabel: t("report-footer-page"),
      ofLabel: t("report-footer-of"),
    });
    pdf.save(`meed-action-report-${inventoryId}.pdf`);
  }, [generate, selectedIds, index, t, lng, inventory, inventoryId, cityId]);

  // A ranking exists, so emissions were retrieved; the context queries are the
  // same ones the detail pages use and are already cached for them.
  const context = useMeedContextFacts({
    lng,
    cityId,
    inventoryId,
    includeEmissions: true,
  });
  const funnel = useMemo(
    () => legalFunnel(ranking, index.size),
    [ranking, index.size],
  );
  const facts = {
    emissionsText,
    inventoryYear: inventory?.year ?? undefined,
    rankedCount: ranked.length,
    excludedCount,
    strongPolicyBacking: backing.strong,
    states,
    hasRanking: true,
    sectorsWithData: context.sectorsWithData,
    indicatorCount: context.indicatorCount,
    finance: context.finance,
    legalFunnel: funnel,
    nationalPolicy: context.policy?.national ?? null,
  };
  const visualFor = (area: MeedContextArea) =>
    meedContextVisual(area, {
      bySector: context.bySector,
      showEmissions: true,
      keyIndicators: context.keyIndicators,
      funnel,
      finance: context.finance,
      policy: context.policy,
      t,
      tContext,
      sectorLabelFor,
    });
  const insights = useMemo(
    () =>
      rankingInsights({
        ranked,
        index,
        weights: scoreWeights,
        bySector: context.bySector,
        financeRoutes: context.financeRoutes,
      }),
    [ranked, index, scoreWeights, context.bySector, context.financeRoutes],
  );
  const inventoryYear = inventory?.year;
  const summaryInputs = useMemo(
    () =>
      [
        inventoryYear && emissionsText
          ? t("summary-input-inventory", {
              year: inventoryYear,
              emissions: emissionsText,
            })
          : null,
        context.sectorsWithData !== null
          ? t("summary-input-sectors", {
              n: context.sectorsWithData,
              total: SECTORS.length,
            })
          : null,
        context.indicatorCount
          ? t("summary-input-indicators", { n: context.indicatorCount })
          : null,
        context.cityProfileLabel,
        index.size ? t("summary-input-catalog", { n: index.size }) : null,
      ].filter((x): x is string => Boolean(x)),
    [inventoryYear, emissionsText, context, index.size, t],
  );

  // Rationale deep links come back here, not into the wizard.
  const hrefFor = (segment: string) =>
    stepHref(lng, cityId, inventoryId, segment, "results");

  return (
    <MeedShell
      lng={lng}
      cityId={cityId}
      inventoryId={inventoryId}
      title={t("page-title")}
      description={t("page-description")}
      currentLabel={t("page-title")}
    >
      <>
        {!isReady ? (
          <MeedCardSkeleton lines={6} />
        ) : rankingError ? (
          // A failed fetch is not "no ranking yet" — telling the user to go
          // generate one they may already have is the wrong instruction.
          <MeedErrorCard
            variant="panel"
            title={t("error-title")}
            body={t("error-body")}
            retryLabel={t("error-retry")}
            onRetry={() => window.location.reload()}
          />
        ) : ranked.length === 0 ? (
          <EmptyState
            title={t("empty-title")}
            body={t("empty-body")}
            actionLabel={t("empty-action")}
            onAction={() =>
              router.push(
                `/${lng}/cities/${cityId}/MEED/${inventoryId}/preflight`,
              )
            }
          />
        ) : (
          <VStack alignItems="stretch" gap="xl">
            <ResultsHeader
              rankedCount={ranked.length}
              excludedCount={excludedCount}
              emissionsText={emissionsText}
              selectedCount={selectedIds.length}
              isGenerating={isRunning}
              progress={
                isRunning
                  ? t("report-progress", {
                      done: progress.done + 1,
                      total: progress.total,
                    })
                  : null
              }
              onGenerate={generateReport}
              t={t}
            />

            {/*
              Named, dismissible, and never blocking: a partial failure still
              produced a report, so this sits beside it rather than replacing it.
            */}
            {reportError && (
              <MeedErrorCard
                title={reportError.title}
                body={reportError.body}
                retryLabel={t("report-error-dismiss")}
                onRetry={() => setReportError(null)}
                actionLabel={reportError.action?.label}
                actionHref={reportError.action?.href}
              />
            )}

            {/*
              One scroll, in the order the user reasons in: what to do, what it
              also buys you, and only then why. The rationale areas used to sit
              behind a "Context" tab, which put the explanation of the ranking
              somewhere most users never opened.
            */}
            <MeedRankingSummary
              insights={insights}
              funnel={funnel}
              backing={backing}
              nationalPolicy={context.policy?.national ?? null}
              inputs={summaryInputs}
              sectorLabelFor={(tag) => sectorTagLabel(tag, t)}
              inventorySectorLabelFor={sectorLabelFor}
              t={t}
              config={
                <MeedRankingConfig
                  inventoryId={inventoryId}
                  weights={scoreWeights}
                  isStale={isStale}
                  editHref={stepHref(
                    lng,
                    cityId,
                    inventoryId,
                    "preferences",
                    "results",
                  )}
                  lng={lng}
                />
              }
            />
            <TopPicks
              actions={topPicks}
              index={index}
              weights={scoreWeights}
              t={t}
              isCatalogLoading={isCatalogLoading}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onOpenDetail={setSelected}
              onBrowseFullRanking={showFullRanking}
            />
            <MeedScoreLegend weights={scoreWeights} t={t} />
            <CoBenefitStrip
              benefits={coBenefits}
              total={topPicks.length}
              t={t}
            />
            <ContextCardGrid
              facts={facts}
              backing={backing}
              t={t}
              hrefFor={hrefFor}
              visualFor={visualFor}
            />

            <FullRanking
              ref={rankingRef}
              actions={ranked}
              index={index}
              weights={scoreWeights}
              t={t}
              onSelect={setSelected}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onExport={exportRanking}
            />
          </VStack>
        )}

        {selected && (
          <DetailPanel
            action={selected}
            index={index}
            weights={scoreWeights}
            t={t}
            onClose={() => setSelected(null)}
            rank={selected.rank}
            total={ranked.length}
            isSelected={selectedIds.includes(selected.action_id)}
            onToggleSelect={toggleSelect}
          />
        )}
      </>
    </MeedShell>
  );
}
