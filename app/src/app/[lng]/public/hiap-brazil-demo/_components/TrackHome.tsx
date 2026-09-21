"use client";
import React, { useMemo, useState } from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import {
  LuChartColumn,
  LuClock,
  LuScale,
  LuShieldAlert,
  LuSparkles,
  LuWallet,
} from "react-icons/lu";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { HeadlineLarge } from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedLatestRanking } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedLatestRanking";
import { ContextCardGrid } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ContextCardGrid";
import { DetailPanel } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/DetailPanel";
import { formatEmissions } from "@/util/helpers";
import type { DemoTrack } from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { SCREEN_IDS, trackHref } from "../_lib/hrefs";
import { RISK_CELLS } from "../_lib/riskCells";
import { DemoHero } from "./DemoHero";
import { TrackTabs } from "./TrackTabs";
import { DemoRankingSummary } from "./DemoRankingSummary";
import { DemoRankingConfig } from "./DemoRankingConfig";
import { useContextAreas } from "./contextAreas";
import { AdaptationDrawerSections } from "./AdaptationDrawerSections";
import { ACTION_BY_ID } from "../_lib/actions";
import { useLabels } from "../_lib/useLabels";

/** BR-A1 / BR-M1 — the module home for one track. */
export function TrackHome({
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
  const tMeed = useTrackT(lng, track, "meed");
  const tResults = useTrackT(lng, track, "meed-results");
  const labels = useLabels(lng, track);
  const router = useRouter();
  const [open, setOpen] = useState<MeedRankedActionResult | null>(null);
  const screenId =
    track === "adaptation"
      ? SCREEN_IDS.adaptation.home
      : SCREEN_IDS.mitigation.home;

  const cellsWithData = RISK_CELLS.filter((c) => city.risk[c.key]).length;
  const emissionsTotal = Object.values(city.inventory.bySector).reduce(
    (s, v) => s + v,
    0,
  );
  const emissions = formatEmissions(emissionsTotal * 1000);
  const heroLine =
    track === "adaptation"
      ? t("hero-line-adaptation", { count: cellsWithData })
      : t("hero-line-mitigation", {
          year: city.inventory.year,
          value: emissions.value,
          unit: emissions.unit,
        });

  const hasRanking = Boolean(state.generatedAt);
  const stored = useMemo(
    () =>
      hasRanking
        ? {
            result: { locode: city.locode, ranked_actions: ranked },
            generatedAtUtc: state.generatedAt!,
          }
        : null,
    [hasRanking, city.locode, ranked, state.generatedAt],
  );

  const { areas, facts, backing, visualFor, indicatorFor, hrefFor } =
    useContextAreas({ lng, data, tResults });

  const summary = useMemo(() => {
    if (!hasRanking) return null;
    const total = ranked.length;
    const inputs = [
      track === "adaptation"
        ? t("summary-input-risk", { count: cellsWithData })
        : tResults("summary-input-inventory", {
            year: city.inventory.year,
            emissions: `${emissions.value} ${emissions.unit}`,
          }),
      t("summary-input-bank", { count: index.size }),
      t("summary-input-legal"),
      t("summary-input-policy"),
    ];
    const lines = [];
    if (adaptation) {
      const top = adaptation.ranked[0];
      const topCell = top?.cells[0] ? labels.cell(top.cells[0].cell) : "";
      const cellCounts = new Map<string, number>();
      for (const s of adaptation.ranked) {
        const c = s.cells[0]?.cell;
        if (c) cellCounts.set(c, (cellCounts.get(c) ?? 0) + 1);
      }
      const [mostCell, mostCount] = [...cellCounts.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0] ?? ["", 0];
      lines.push({
        icon: LuShieldAlert,
        text: t("insight-top-cell", {
          count: mostCount,
          total,
          cell: labels.cell(mostCell as never) || topCell,
        }),
      });
      const strongLegal = adaptation.ranked.filter(
        (s) => s.action.legal.score >= 4,
      ).length;
      lines.push({
        icon: LuScale,
        text: t("insight-legal", { count: strongLegal, total }),
      });
      const selfFund = adaptation.ranked.filter((s) => s.finance >= 1).length;
      lines.push({
        icon: LuWallet,
        text: t("insight-finance", { count: selfFund, total }),
      });
      const shortTerm = adaptation.ranked.filter(
        (s) => s.action.timeline === "<5 years",
      ).length;
      lines.push({
        icon: LuClock,
        text: t("insight-timeline", { count: shortTerm, total }),
      });
      lines.push({
        icon: LuChartColumn,
        text: t("insight-not-ranked", { count: adaptation.notRanked.length }),
      });
    } else {
      lines.push({
        icon: LuChartColumn,
        text: t("insight-mitigation-provisional"),
      });
    }
    return { inputs, lines };
  }, [
    hasRanking,
    ranked.length,
    track,
    t,
    tResults,
    cellsWithData,
    city.inventory.year,
    emissions.value,
    emissions.unit,
    index.size,
    adaptation,
    labels,
  ]);

  const scoredFor = (id: string) =>
    adaptation?.ranked.find((s) => s.action.id === id) ?? null;

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
    >
      <DemoHero
        lng={lng}
        city={city}
        track={track}
        screenId={screenId}
        line={heroLine}
      />
      <TrackTabs lng={lng} city={city.slug} track={track} />
      <Box
        display="flex"
        mx="auto"
        pt="xxl"
        pb="xxl-6"
        px="l"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="xl"
      >
        <HStack
          justifyContent="space-between"
          alignItems={{ base: "stretch", md: "flex-end" }}
          flexDirection={{ base: "column", md: "row" }}
          gap="l"
          py="l"
        >
          <VStack alignItems="stretch" gap="s" flex="1" minW={0}>
            <HeadlineLarge color="content.primary">
              {tMeed("overview-title")}
            </HeadlineLarge>
            <BodyLarge color="content.secondary" maxW="640px">
              {tMeed("overview-description")}
            </BodyLarge>
          </VStack>
          <VStack
            alignItems={{ base: "stretch", md: "flex-end" }}
            gap="xs"
            flexShrink={0}
          >
            <MeedButton
              minW="auto"
              px="l"
              leftIcon={<LuSparkles size={16} />}
              disabled={!isReady}
              onClick={() =>
                router.push(trackHref(lng, city.slug, track, "preferences"))
              }
            >
              {hasRanking
                ? tMeed("ranking-rerun")
                : tMeed("get-recommendations")}
            </MeedButton>
            <Caption
              color="content.tertiary"
              textAlign={{ base: "start", md: "end" }}
              maxW="360px"
            >
              {t(
                track === "adaptation"
                  ? "get-recommendations-hint-adaptation"
                  : "get-recommendations-hint-mitigation",
              )}
            </Caption>
          </VStack>
        </HStack>

        {isReady && stored && summary && (
          <DemoRankingSummary
            inputs={summary.inputs}
            lines={summary.lines}
            t={tResults}
            config={
              <DemoRankingConfig
                preferences={state.preferences}
                editHref={trackHref(lng, city.slug, track, "preferences")}
                labelFor={{
                  sector: labels.sector,
                  coBenefit: labels.coBenefit,
                  timeline: labels.timeline,
                  risk: labels.cell,
                }}
                t={tResults}
              />
            }
          />
        )}
        {isReady && stored && (
          <MeedLatestRanking
            ranking={stored}
            index={index}
            isCatalogLoading={false}
            weights={weights}
            excludedCount={adaptation ? adaptation.notRanked.length : null}
            isStale={false}
            resultsHref={trackHref(lng, city.slug, track, "results")}
            onOpenDetail={setOpen}
            lng={lng}
            t={tMeed}
            tResults={tResults}
          />
        )}

        <ContextCardGrid
          title={tMeed("how-ranking-works-title")}
          description={tMeed("how-ranking-works-description")}
          facts={facts}
          backing={backing}
          t={tResults}
          hrefFor={hrefFor}
          areas={areas}
          visualFor={visualFor}
          indicatorFor={indicatorFor}
        />
      </Box>

      {open && (
        <DetailPanel
          action={open}
          index={index}
          weights={weights}
          t={tResults}
          onClose={() => setOpen(null)}
          rank={open.rank}
          total={ranked.length}
          extraSections={
            adaptation && ACTION_BY_ID[open.action_id] ? (
              <AdaptationDrawerSections
                action={ACTION_BY_ID[open.action_id]}
                scored={scoredFor(open.action_id)}
                city={city}
                lng={lng}
                t={t}
                onOpenAction={(id) => {
                  const r = ranked.find((x) => x.action_id === id);
                  if (r) setOpen(r);
                }}
              />
            ) : undefined
          }
        />
      )}
    </Box>
  );
}
