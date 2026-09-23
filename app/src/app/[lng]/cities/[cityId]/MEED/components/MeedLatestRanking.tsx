"use client";
import { HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import type { MeedStoredRanking } from "../meedLocalState";
import type { MeedActionIndex } from "../[inventory]/results/components/actionCatalog";
import { TopPickCard } from "../[inventory]/results/components/TopPickCard";
import type { MeedScoreWeights } from "../[inventory]/results/components/rankingFacts";
import { MeedScoreLegend } from "./MeedScoreComposition";
import { MeedCardGridSkeleton } from "./MeedSkeletons";
import { MeedButton } from "./MeedButton";
import { MeedStatusTag } from "./MeedStatusTag";

export interface MeedLatestRankingProps {
  ranking: MeedStoredRanking;
  /** Live action catalog, so names come from one place. */
  index: MeedActionIndex;
  isCatalogLoading: boolean;
  /** The weights this ranking was scored with. */
  weights: MeedScoreWeights;
  /** Actions the legal screening removed, when the ranking reports it. */
  excludedCount: number | null;
  /** True when inputs changed after this ranking was produced. */
  isStale: boolean;
  resultsHref: string;
  onOpenDetail: (action: MeedRankedActionResult) => void;
  lng: string;
  /** `meed` namespace. */
  t: TFunction;
  /** `meed-results` namespace — the top-pick cards read their labels from it. */
  tResults: TFunction;
}

/**
 * The latest ranking's top three, on the module home.
 *
 * Once a result exists it, not the setup, is what the user came back for, so
 * this sits between the module block and the context cards. It also has to
 * answer "is this still true?": when an input changes after generating, the
 * ranking silently stops matching, so a changed fingerprint surfaces as an
 * explicit re-run prompt rather than quietly serving a stale list.
 *
 * The cards are the same `TopPickCard` the results screen uses, minus the
 * report checkbox: selecting actions for a report is the results screen's job.
 */
export function MeedLatestRanking({
  ranking,
  index,
  isCatalogLoading,
  weights,
  excludedCount,
  isStale,
  resultsHref,
  onOpenDetail,
  lng,
  t,
  tResults,
}: MeedLatestRankingProps) {
  const ranked = ranking.result.ranked_actions ?? [];
  const topPicks = ranked.slice(0, 3);
  const generated = new Date(ranking.generatedAtUtc);
  const generatedLabel = Number.isNaN(generated.valueOf())
    ? null
    : new Intl.DateTimeFormat(lng, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(generated);

  return (
    <VStack alignItems="stretch" gap="m">
      <HStack
        justifyContent="space-between"
        alignItems="flex-end"
        gap="m"
        flexWrap="wrap"
      >
        <VStack alignItems="flex-start" gap="xs">
          <Overline color="content.tertiary">{t("ranking-eyebrow")}</Overline>
          <TitleMedium color="content.primary">
            {t("ranking-title", { count: ranked.length })}
          </TitleMedium>
          {excludedCount !== null && (
            <BodySmall color="content.secondary">
              {t("ranking-census", {
                ranked: ranked.length,
                excluded: excludedCount,
              })}
            </BodySmall>
          )}
        </VStack>
        <HStack gap="s" flexShrink={0} alignItems="center">
          {generatedLabel && (
            <BodySmall color="content.tertiary">
              {t("ranking-generated-at", { when: generatedLabel })}
            </BodySmall>
          )}
          {/* Sample data has to announce itself. The flag that produces it is
              off by default, but when it is on nothing else tells a synthetic
              ranking apart from a real one. */}
          {ranking.isMock && (
            <MeedStatusTag tone="warning">{t("sample-data")}</MeedStatusTag>
          )}
          <MeedStatusTag tone={isStale ? "warning" : "positive"}>
            {isStale ? t("ranking-stale-tag") : t("ranking-current-tag")}
          </MeedStatusTag>
        </HStack>
      </HStack>

      {isStale && (
        <HStack
          gap="s"
          px="m"
          py="s"
          borderRadius="rounded"
          bg="sentiment.warningOverlay"
          alignItems="flex-start"
        >
          <Icon
            as={LuTriangleAlert}
            boxSize="16px"
            color="sentiment.warningDefault"
            mt="xs"
          />
          <BodyMedium color="sentiment.warningDefault">
            {t("ranking-stale-body")}
          </BodyMedium>
        </HStack>
      )}

      {isCatalogLoading ? (
        <MeedCardGridSkeleton items={3} />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="m">
          {topPicks.map((action) => (
            <TopPickCard
              key={action.action_id}
              action={action}
              index={index}
              weights={weights}
              t={tResults}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </SimpleGrid>
      )}

      <MeedScoreLegend weights={weights} t={tResults} />

      {/* One way forward. Re-running lives on the header button, which
          already reads "Re-run ranking" once a result exists. */}
      <HStack justifyContent="center">
        <MeedButton
          asChild
          minW="auto"
          px="l"
          rightIcon={<Icon as={LuArrowRight} boxSize="16px" />}
        >
          <NextLink href={resultsHref}>{t("ranking-view-all")}</NextLink>
        </MeedButton>
      </HStack>
    </VStack>
  );
}
