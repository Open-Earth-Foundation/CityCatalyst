"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Box, Collapsible, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuChevronDown } from "react-icons/lu";
import { LabelLarge } from "@/components/package/Texts/Label";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { DetailPanel } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/DetailPanel";
import { FullRanking } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/FullRanking";
import { RankingTable } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/RankingTable";
import { ResultsHeader } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ResultsHeader";
import { TopPicks } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/TopPicks";
import { buildReportPdf } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/meedReportPdf";
import type { DemoTrack } from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { useLabels } from "../_lib/useLabels";
import { trackHref } from "../_lib/hrefs";
import { ACTION_BY_ID } from "../_lib/actions";
import { MITIGATION_SHIFTS } from "../_lib/mitigation";
import { buildDemoReport } from "../_lib/report";
import { pick } from "../_lib/localized";
import { NotRankedLane } from "./NotRankedLane";
import { AdaptationDrawerSections } from "./AdaptationDrawerSections";
import { RankingSettings } from "./RankingSettings";
import { ShiftInterventionList } from "./ShiftInterventionList";
import { ReportControl } from "./next/ReportControl";

/**
 * Everything a ranking produces, on one screen: the census, the configuration
 * it ran with, the top picks with the report control beside
 * their checkboxes, the full table (with the same control) and the chart,
 * and, collapsed, the actions outside the ranking — plus the drawer.
 */
export function RankingView({
  lng,
  citySlug,
  track,
}: {
  lng: string;
  citySlug: string;
  track: DemoTrack;
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

  const reportProps = {
    onGenerate: generateReport,
    isGenerating,
    progress: null,
  };

  return (
    <>
      <VStack alignItems="stretch" gap="xxl">
        <ResultsHeader
          rankedCount={ranked.length}
          excludedCount={adaptation ? adaptation.notRanked.length : null}
          t={tResults}
          trailing={
            track === "adaptation" ? (
              <ReportControl
                selectedCount={selectedIds.length}
                isGenerating={isGenerating}
                onGenerate={generateReport}
                t={tResults}
                hintId="a1-report-hint"
              />
            ) : undefined
          }
        />

        <RankingSettings
          preferences={state.preferences}
          track={track}
          editHref={trackHref(lng, city.slug, track, "preferences")}
          labelFor={{
            sector: labels.sector,
            coBenefit: labels.coBenefit,
            timeline: labels.timeline,
            risk: labels.cell,
            action: (id) =>
              ACTION_BY_ID[id] ? pick(ACTION_BY_ID[id].name, lng) : id,
          }}
          t={t}
          tResults={tResults}
        />

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
            {...(track === "adaptation" ? {} : reportProps)}
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
          {track === "adaptation" ? (
            // One table only: the review found the glance chart repeated it
            // on a different colour scale.
            <Box ref={rankingRef} scrollMarginTop="l">
              <RankingTable
                actions={ranked}
                index={index}
                weights={weights}
                t={tResults}
                onSelect={setOpen}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            </Box>
          ) : (
            <FullRanking
              ref={rankingRef}
              actions={ranked}
              index={index}
              weights={weights}
              t={tResults}
              onSelect={setOpen}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              {...reportProps}
            />
          )}
          {track === "adaptation" && (
            <BodySmall color="content.tertiary">
              {t("glance-normalised-note")}
            </BodySmall>
          )}
        </VStack>

        {adaptation && adaptation.notRanked.length > 0 && (
          <Collapsible.Root>
            <Collapsible.Trigger asChild>
              <Box
                as="button"
                w="full"
                textAlign="start"
                px="m"
                py="s"
                borderRadius="rounded"
                _hover={{ bg: "background.neutral" }}
              >
                <HStack justifyContent="space-between" gap="s">
                  <LabelLarge color="content.secondary">
                    {t("not-ranked-footnote-title", {
                      count: adaptation.notRanked.length,
                    })}
                  </LabelLarge>
                  <Icon
                    as={LuChevronDown}
                    boxSize="16px"
                    color="content.tertiary"
                  />
                </HStack>
              </Box>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <Box pt="m">
                <NotRankedLane
                  items={adaptation.notRanked}
                  lng={lng}
                  t={t}
                  onOpen={(a) => openById(a.id)}
                />
              </Box>
            </Collapsible.Content>
          </Collapsible.Root>
        )}
      </VStack>

      {open && (
        <DetailPanel
          action={open}
          index={index}
          weights={weights}
          t={tResults}
          lng={lng}
          onClose={() => setOpen(null)}
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
