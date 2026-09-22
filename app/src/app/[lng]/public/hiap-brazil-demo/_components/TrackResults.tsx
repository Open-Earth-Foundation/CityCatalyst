"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Box, Card, HStack, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedFunnelStrip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedFunnelStrip";
import { MeedScoreLegend } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedScoreComposition";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { ContextCardGrid } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ContextCardGrid";
import { CoBenefitStrip } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/CoBenefitStrip";
import { DetailPanel } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/DetailPanel";
import { EmptyState } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/EmptyState";
import { FullRanking } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/FullRanking";
import { ResultsHeader } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ResultsHeader";
import { TopPicks } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/TopPicks";
import { tallyCoBenefits } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/coBenefits";
import { buildReportPdf } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/meedReportPdf";
import type { DemoTrack } from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { SCREEN_IDS, trackHref } from "../_lib/hrefs";
import { ACTION_BY_ID, ADAPTATION_ACTIONS } from "../_lib/actions";
import { SECTOR_HEX } from "../_lib/riskCells";
import { MITIGATION_SHIFTS } from "../_lib/mitigation";
import { buildDemoReport } from "../_lib/report";
import { DemoShell } from "./DemoShell";
import { NotRankedLane } from "./NotRankedLane";
import { AdaptationDrawerSections } from "./AdaptationDrawerSections";
import { ShiftInterventionList } from "./ShiftInterventionList";
import { useContextAreas } from "./contextAreas";

/** BR-A5 / BR-M2 — the results screen for one track. */
export function TrackResults({
  lng,
  citySlug,
  track,
}: {
  lng: string;
  citySlug: string;
  track: DemoTrack;
}) {
  const data = useTrack(lng, citySlug, track);
  const { city, ranked, index, weights, adaptation, state, isReady } = data;
  const { t } = useDemoT(lng);
  const tResults = useTrackT(lng, track, "meed-results");
  const router = useRouter();
  const [open, setOpen] = useState<MeedRankedActionResult | null>(null);
  const [openUnranked, setOpenUnranked] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const rankingRef = useRef<HTMLDivElement | null>(null);
  const screenId =
    track === "adaptation"
      ? SCREEN_IDS.adaptation.results
      : SCREEN_IDS.mitigation.results;
  const hasRanking = Boolean(state.generatedAt);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const topPicks = useMemo(() => ranked.slice(0, 3), [ranked]);
  const coBenefits = useMemo(
    () => tallyCoBenefits(topPicks, index),
    [topPicks, index],
  );
  const { areas, facts, backing, visualFor, indicatorFor, ctaFor, hrefFor } =
    useContextAreas({ lng, data, tResults });

  const generateReport = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setIsGenerating(true);
    try {
      const documents = buildDemoReport(selectedIds, data, lng, t);
      const pdf = await buildReportPdf(documents, {
        title: tResults("report-title"),
        cityName: `${city.name}, ${city.state}`,
        subtitle: tResults("report-subtitle", { count: documents.length }),
        limitationsLabel: tResults("report-limitations"),
        generatedBy: t("report-generated-by-demo"),
        generatedOn: `${tResults("report-footer-generated-on")} ${new Date().toLocaleDateString(lng)}`,
        pageLabel: tResults("report-footer-page"),
        ofLabel: tResults("report-footer-of"),
      });
      pdf.save(`hiap-brazil-demo-${city.slug}-${track}.pdf`);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedIds, data, lng, t, tResults, city, track]);

  // The unranked drawer reuses DetailPanel with a synthetic zero-score row so
  // the description, co-benefits and adaptation sections all render.
  const unrankedRow: MeedRankedActionResult | null = useMemo(() => {
    if (!openUnranked) return null;
    return {
      action_id: openUnranked,
      rank: 0,
      final_score: 0,
      impact_score: 0,
      alignment_score: 0,
      feasibility_score: 0,
      evidence_summary: {},
    };
  }, [openUnranked]);

  const scoredFor = (id: string) =>
    adaptation?.ranked.find((s) => s.action.id === id) ?? null;
  const openById = (id: string) => {
    const r = ranked.find((x) => x.action_id === id);
    if (r) {
      setOpenUnranked(null);
      setOpen(r);
    } else if (ACTION_BY_ID[id]) {
      setOpen(null);
      setOpenUnranked(id);
    }
  };

  const drawerExtra = (id: string) =>
    adaptation && ACTION_BY_ID[id] ? (
      <AdaptationDrawerSections
        action={ACTION_BY_ID[id]}
        scored={scoredFor(id)}
        city={city}
        lng={lng}
        t={t}
        onOpenAction={openById}
      />
    ) : undefined;

  const funnel = useMemo(() => {
    if (!adaptation) return null;
    const bank = ADAPTATION_ACTIONS.length;
    const covered =
      bank -
      adaptation.notRanked.filter((n) => n.reason === "outside_coverage")
        .length;
    const direct =
      covered -
      adaptation.notRanked.filter(
        (n) => n.reason === "complementary" || n.reason === "no_impact_here",
      ).length;
    const legal =
      direct -
      adaptation.notRanked.filter((n) => n.reason === "legally_blocked").length;
    return [
      {
        label: t("funnel-bank"),
        value: bank,
        tone: "neutral" as const,
        sublabel: t("funnel-bank-sub"),
      },
      {
        label: t("funnel-covered"),
        value: covered,
        tone: "info" as const,
        sublabel: t("funnel-covered-sub"),
      },
      {
        label: t("funnel-direct"),
        value: direct,
        tone: "info" as const,
        sublabel: t("funnel-direct-sub"),
      },
      {
        label: t("funnel-legal"),
        value: legal,
        tone: "warning" as const,
        sublabel: t("funnel-legal-sub"),
      },
      {
        label: t("funnel-ranked"),
        value: adaptation.ranked.length,
        tone: "positive" as const,
        sublabel: t("funnel-ranked-sub"),
      },
    ];
  }, [adaptation, t]);

  return (
    <DemoShell
      lng={lng}
      city={city}
      track={track}
      segment="results"
      screenId={screenId}
      openPoints={
        track === "adaptation"
          ? [t("open-results-legal"), t("open-results-narrative")]
          : [t("open-mitigation-review"), t("open-mitigation-scores")]
      }
      title={tResults("page-title")}
      description={tResults("page-description")}
      backLabel={t("back-to-home")}
    >
      {!isReady ? null : !hasRanking ? (
        <EmptyState
          title={tResults("empty-title")}
          body={tResults("empty-body")}
          actionLabel={tResults("empty-action")}
          onAction={() =>
            router.push(trackHref(lng, city.slug, track, "preferences"))
          }
        />
      ) : (
        <VStack alignItems="stretch" gap="xl">
          <ResultsHeader
            rankedCount={ranked.length}
            excludedCount={adaptation ? adaptation.notRanked.length : null}
            selectedCount={selectedIds.length}
            isGenerating={isGenerating}
            progress={null}
            onGenerate={generateReport}
            t={tResults}
          />

          {funnel && (
            <Card.Root borderColor="border.overlay">
              <Card.Body>
                <VStack alignItems="stretch" gap="s">
                  <HStack gap="s" alignItems="center" flexWrap="wrap">
                    <LabelLarge color="content.primary">
                      {t("funnel-title")}
                    </LabelLarge>
                    <MeedStatusTag tone="info">
                      {t("funnel-per-city")}
                    </MeedStatusTag>
                  </HStack>
                  <MeedFunnelStrip
                    steps={funnel}
                    ariaLabel={t("funnel-aria")}
                    tipTitle={t("funnel-title")}
                    tipNote={t("funnel-tip-note")}
                  />
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          <TopPicks
            actions={topPicks}
            index={index}
            weights={weights}
            t={tResults}
            isCatalogLoading={false}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onOpenDetail={setOpen}
            onBrowseFullRanking={() =>
              rankingRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          />
          <MeedScoreLegend weights={weights} t={tResults} />
          <CoBenefitStrip
            benefits={coBenefits}
            total={topPicks.length}
            t={tResults}
          />

          {track === "mitigation" && (
            <ShiftInterventionList
              shifts={MITIGATION_SHIFTS}
              ranked={ranked}
              weights={weights}
              t={t}
              tResults={tResults}
              lng={lng}
              onOpen={setOpen}
            />
          )}

          <FullRanking
            ref={rankingRef}
            actions={ranked}
            index={index}
            weights={weights}
            t={tResults}
            onSelect={setOpen}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            colorOf={
              track === "adaptation"
                ? (tag) =>
                    tag ? SECTOR_HEX[tag as keyof typeof SECTOR_HEX] : undefined
                : undefined
            }
          />
          {track === "adaptation" && (
            <BodySmall color="content.tertiary">
              {t("glance-normalised-note")}
            </BodySmall>
          )}

          {adaptation && (
            <NotRankedLane
              items={adaptation.notRanked}
              lng={lng}
              t={t}
              onOpen={(a) => openById(a.id)}
            />
          )}

          <ContextCardGrid
            facts={facts}
            backing={backing}
            t={tResults}
            hrefFor={hrefFor}
            areas={areas}
            visualFor={visualFor}
            indicatorFor={indicatorFor}
            ctaFor={ctaFor}
          />
        </VStack>
      )}

      {open && (
        <DetailPanel
          action={open}
          index={index}
          weights={weights}
          t={tResults}
          onClose={() => setOpen(null)}
          rank={open.rank}
          total={ranked.length}
          isSelected={selectedIds.includes(open.action_id)}
          onToggleSelect={toggleSelect}
          size="lg"
          extraSections={drawerExtra(open.action_id)}
        />
      )}
      {unrankedRow && (
        <DetailPanel
          action={unrankedRow}
          index={index}
          weights={weights}
          t={tResults}
          onClose={() => setOpenUnranked(null)}
          size="lg"
          extraSections={
            <Box>
              <MeedStatusTag tone="warning" mb="m">
                {t("drawer-not-ranked-tag")}
              </MeedStatusTag>
              {drawerExtra(unrankedRow.action_id)}
            </Box>
          }
        />
      )}
    </DemoShell>
  );
}
