"use client";
import React from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { LuSparkles } from "react-icons/lu";
import { HeadlineLarge } from "@/components/package/Texts/Headline";
import { BodyLarge, BodySmall } from "@/components/package/Texts/Body";
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
 * BR-A1 / BR-M1 — the module home for one track. Before a ranking exists it
 * invites the user in and explains the inputs. Once one exists it *is* the
 * results screen: one place with all the context, rather than a summary and
 * a "view all recommendations" copy of it.
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
  const { city, state, isReady } = data;
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
            <BodySmall
              color="content.tertiary"
              textAlign={{ base: "start", md: "end" }}
              maxW="360px"
            >
              {t(
                track === "adaptation"
                  ? "get-recommendations-hint-adaptation"
                  : "get-recommendations-hint-mitigation",
              )}
            </BodySmall>
          </VStack>
        </HStack>

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
