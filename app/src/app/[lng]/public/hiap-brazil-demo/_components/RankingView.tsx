"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Box, Card, HStack, VStack } from "@chakra-ui/react";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedFunnelStrip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedFunnelStrip";
import { MeedScoreLegend } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedScoreComposition";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { ContextCardGrid } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ContextCardGrid";
import { CoBenefitStrip } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/CoBenefitStrip";
import { DetailPanel } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/DetailPanel";
import { FullRanking } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/FullRanking";
import { ResultsHeader } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ResultsHeader";
import { TopPicks } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/TopPicks";
import {
  tallyCoBenefits,
  tallyTradeOffs,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/coBenefits";
import { buildReportPdf } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/meedReportPdf";
import type { DemoTrack } from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { useLabels } from "../_lib/useLabels";
import { trackHref } from "../_lib/hrefs";
import { ACTION_BY_ID, ADAPTATION_ACTIONS } from "../_lib/actions";
import { SECTOR_HEX } from "../_lib/riskCells";
import { MITIGATION_SHIFTS } from "../_lib/mitigation";
import { buildDemoReport } from "../_lib/report";
import { pick } from "../_lib/localized";
import { NotRankedLane } from "./NotRankedLane";
import { AdaptationDrawerSections } from "./AdaptationDrawerSections";
import { DemoRankingConfig } from "./DemoRankingConfig";
import { ShiftInterventionList } from "./ShiftInterventionList";
import { useContextAreas } from "./contextAreas";

/**
 * Everything a ranking produces, on one screen: the census, the configuration
 * it ran with, the funnel, the top picks with the report control beside
 * their checkboxes, the full table (with the same control) and the chart,
 * the actions outside the ranking, and the context cards — plus the drawer.
 */
export function RankingView({
  lng,
  citySlug,
  track,
  headerAction,
}: {
  lng: string;
  citySlug: string;
  track: DemoTrack;
  /** Rendered at the right of the census line, e.g. the re-run button. */
  headerAction?: React.ReactNode;
}) {
  const data = useTrack(lng, citySlug, track);
  const { city, ranked, index, weights, adaptation, state } = data;
  const { t } = useDemoT(lng);
  const tResults = useTrackT(lng, track, "meed-results");
  const labels = useLabels(lng, track);
  const [open, setOpen] = useState<MeedRankedActionResult | null>(null);
  const [openUnranked, setOpenUnranked] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const rankingRef = useRef<HTMLDivElement | null>(null);

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
  const tradeOffs = useMemo(
    () => tallyTradeOffs(topPicks, index),
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
  const rankOf = (id: string) =>
    ranked.find((x) => x.action_id === id)?.rank ?? null;
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
        rankOf={rankOf}
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
    const excluded = adaptation.notRanked.filter(
      (n) => n.reason === "excluded_by_city",
    ).length;
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
      // The city's own exclusions only appear as a stage when there are any,
      // so the last two numbers never differ without a stage explaining it.
      ...(excluded > 0
        ? [
            {
              label: t("funnel-excluded"),
              value: legal - excluded,
              tone: "caution" as const,
              sublabel: t("funnel-excluded-sub"),
            },
          ]
        : []),
      {
        label: t("funnel-ranked"),
        value: adaptation.ranked.length,
        tone: "positive" as const,
        sublabel: t("funnel-ranked-sub"),
      },
    ];
  }, [adaptation, t]);

  const reportProps = {
    onGenerate: generateReport,
    isGenerating,
    progress: null,
  };

  return (
    <>
      <VStack alignItems="stretch" gap="xl">
        <ResultsHeader
          rankedCount={ranked.length}
          excludedCount={adaptation ? adaptation.notRanked.length : null}
          trailing={headerAction}
          t={tResults}
        />

        <Card.Root borderColor="border.overlay">
          <Card.Body p="l">
            <DemoRankingConfig
              preferences={state.preferences}
              editHref={trackHref(lng, city.slug, track, "preferences")}
              labelFor={{
                sector: labels.sector,
                coBenefit: labels.coBenefit,
                timeline: labels.timeline,
                risk: labels.cell,
                action: (id) =>
                  ACTION_BY_ID[id] ? pick(ACTION_BY_ID[id].name, lng) : id,
              }}
              t={tResults}
            />
          </Card.Body>
        </Card.Root>

        {funnel && (
          <Card.Root borderColor="border.overlay">
            <Card.Body p="l">
              <VStack alignItems="stretch" gap="m">
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
                  size="lg"
                  ariaLabel={t("funnel-aria")}
                />
              </VStack>
            </Card.Body>
          </Card.Root>
        )}

        <VStack alignItems="stretch" gap="l">
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
            {...reportProps}
          />
          <MeedScoreLegend weights={weights} t={tResults} />
          <CoBenefitStrip
            benefits={coBenefits}
            tradeOffs={tradeOffs}
            total={topPicks.length}
            t={tResults}
          />
        </VStack>

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

        <VStack alignItems="stretch" gap="s">
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
            {...reportProps}
          />
          {track === "adaptation" && (
            <BodySmall color="content.tertiary">
              {t("glance-normalised-note")}
            </BodySmall>
          )}
        </VStack>

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

      {open && (
        <DetailPanel
          action={open}
          index={index}
          weights={weights}
          t={tResults}
          lng={lng}
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
          lng={lng}
          onClose={() => setOpenUnranked(null)}
          size="lg"
          showScore={false}
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
    </>
  );
}
