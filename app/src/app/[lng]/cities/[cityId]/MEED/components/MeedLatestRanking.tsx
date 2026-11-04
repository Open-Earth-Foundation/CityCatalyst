"use client";
import { HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { BodyMedium } from "@/components/package/Texts/Body";
import type { MeedStoredRanking } from "../meedLocalState";
import type { MeedActionIndex } from "../[inventory]/results/components/actionCatalog";
import { TopPickCard } from "../[inventory]/results/components/TopPickCard";
import type { MeedScoreWeights } from "../[inventory]/results/components/rankingFacts";
import { MeedCardGridSkeleton } from "./MeedSkeletons";
import { MeedStatusTag } from "./MeedStatusTag";
import { MeedTextLink } from "./MeedTextLink";

export interface MeedLatestRankingProps {
  ranking: MeedStoredRanking;
  /** Live action catalog, so names come from one place. */
  index: MeedActionIndex;
  isCatalogLoading: boolean;
  /** The weights this ranking was scored with. */
  weights: MeedScoreWeights | null;
  /** True when inputs changed after this ranking was produced. */
  isStale: boolean;
  resultsHref: string;
  onOpenDetail: (action: MeedRankedActionResult) => void;
  /** `meed` namespace. */
  t: TFunction;
  /** `meed-results` namespace — the top-pick cards read their labels from it. */
  tResults: TFunction;
}

/**
 * The latest ranking's top three, on the module home, inside the section the
 * page frames for it. It also has to answer "is this still true?": when an
 * input changes after generating, the ranking silently stops matching, so a
 * changed fingerprint surfaces as an explicit re-run prompt rather than
 * quietly serving a stale list.
 *
 * The cards are the same `TopPickCard` the results screen uses, minus the
 * report checkbox: selecting actions for a report is the results screen's job.
 */
export function MeedLatestRanking({
  ranking,
  index,
  isCatalogLoading,
  weights,
  isStale,
  resultsHref,
  onOpenDetail,
  t,
  tResults,
}: MeedLatestRankingProps) {
  const ranked = ranking.result.ranked_actions ?? [];
  const topPicks = ranked.slice(0, 3);

  return (
    <VStack alignItems="stretch" gap="l">
      {/* Sample data has to announce itself. The flag that produces it is off
          by default, but when it is on nothing else tells a synthetic ranking
          apart from a real one. */}
      {ranking.isMock && (
        <HStack>
          <MeedStatusTag tone="warning">{t("sample-data")}</MeedStatusTag>
        </HStack>
      )}

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
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="xl" alignItems="stretch">
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

      {/* One way forward. Re-running lives on the header button, which
          already reads "Re-run ranking" once a result exists. */}
      <MeedTextLink href={resultsHref} alignSelf="flex-start">
        {t("ranking-view-all")}
      </MeedTextLink>
    </VStack>
  );
}
