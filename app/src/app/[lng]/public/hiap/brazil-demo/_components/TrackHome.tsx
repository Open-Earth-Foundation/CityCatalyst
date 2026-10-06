"use client";
import React from "react";
import { Box } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { LuSparkles } from "react-icons/lu";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { ContextCardGrid } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/ContextCardGrid";
import { formatEmissions } from "@/util/helpers";
import type { DemoTrack } from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { SCREEN_IDS, trackHref } from "../_lib/hrefs";
import { RISK_CELLS } from "../_lib/riskCells";
import { DemoHero } from "./DemoHero";
import { TrackTabs } from "./TrackTabs";
import { ConceptNotice } from "./ConceptNotice";
import { RankingView } from "./RankingView";
import { useContextAreas } from "./contextAreas";

/**
 * BR-A1 / BR-M1 — the module home for one track. The hero says what the
 * module does and holds the one call to action; the tabs pick the track;
 * the column below is either the inputs the ranking will use (before a
 * ranking) or the ranking itself (after one), with nothing in between.
 */
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
  const { city, ranked, state, isReady } = data;
  const { t } = useDemoT(lng);
  const tMeed = useTrackT(lng, track, "meed");
  const tResults = useTrackT(lng, track, "meed-results");
  const router = useRouter();
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
  const { areas, facts, backing, visualFor, indicatorFor, ctaFor, hrefFor } =
    useContextAreas({ lng, data, tResults });

  const openPoints =
    track === "mitigation"
      ? [t("open-mitigation-review"), t("open-mitigation-scores")]
      : hasRanking
        ? [t("open-results-legal"), t("open-results-narrative")]
        : [];

  const status = !isReady
    ? undefined
    : hasRanking
      ? t("hero-status-ranked", {
          date: new Date(state.generatedAt!).toLocaleDateString(lng),
          count: ranked.length,
          // The date carries "/" — React escapes text itself.
          interpolation: { escapeValue: false },
        })
      : t("hero-status-none");

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
        description={tMeed("overview-description")}
        status={status}
        action={
          <MeedButton
            minW="auto"
            px="l"
            bg="base.light"
            color="content.link"
            _hover={{ bg: "background.neutral" }}
            leftIcon={<LuSparkles size={16} />}
            disabled={!isReady}
            onClick={() =>
              router.push(trackHref(lng, city.slug, track, "preferences"))
            }
          >
            {hasRanking ? tMeed("ranking-rerun") : tMeed("get-recommendations")}
          </MeedButton>
        }
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
        {!isReady ? null : hasRanking ? (
          <RankingView lng={lng} citySlug={citySlug} track={track} />
        ) : (
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
            ctaFor={ctaFor}
          />
        )}
      </Box>

      <ConceptNotice lng={lng} points={openPoints} />
    </Box>
  );
}
