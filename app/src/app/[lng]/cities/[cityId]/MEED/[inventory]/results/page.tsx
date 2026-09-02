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
import { NextStepsBanner } from "./components/NextStepsBanner";
import { buildActionIndex } from "./components/actionCatalog";
import { buildRankingCsv } from "./components/rankingCsv";
import { downloadCsv } from "@/util/csv";
import { useMeedRanking } from "../../useMeedRanking";
import { tallyCoBenefits } from "./components/coBenefits";
import {
  excludedActionCount,
  policyBacking,
  readRankingWeights,
} from "./components/rankingFacts";
import { PILLAR_WEIGHTS } from "../../scoringWeights";
import { MeedCardSkeleton } from "../../components/MeedSkeletons";
import { MeedErrorCard } from "../../components/MeedErrorCard";

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  const { t } = useTranslation(lng, "meed-results");
  const router = useRouter();

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
  const emissionsText = emissions
    ? `${emissions.value} ${emissions.unit}CO2e`.trim()
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

  const facts = {
    emissionsText,
    inventoryYear: inventory?.year ?? undefined,
    rankedCount: ranked.length,
    excludedCount,
    strongPolicyBacking: backing.strong,
    states,
  };

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
              t={t}
            />

            {/*
              One scroll, in the order the user reasons in: what to do, what it
              also buys you, and only then why. The rationale areas used to sit
              behind a "Context" tab, which put the explanation of the ranking
              somewhere most users never opened.
            */}
            <TopPicks
              actions={topPicks}
              index={index}
              t={t}
              isCatalogLoading={isCatalogLoading}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onOpenDetail={setSelected}
              onBrowseFullRanking={showFullRanking}
            />
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
              onShowFullRanking={showFullRanking}
            />
            <NextStepsBanner
              selectedCount={selectedIds.length}
              onBrowseFullRanking={showFullRanking}
              t={t}
            />

            <FullRanking
              ref={rankingRef}
              actions={ranked}
              index={index}
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
          />
        )}
      </>
    </MeedShell>
  );
}
