"use client";
import React, { useCallback, useMemo, useState } from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import { api, useGetMeedActionsQuery } from "@/services/api";
import { Box, HStack, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { formatEmissions } from "@/util/helpers";
import { Hero } from "@/components/GHGIHomePage/Hero";
import {
  HeadlineLarge,
  HeadlineSmall,
} from "@/components/package/Texts/Headline";
import { BodyLarge } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedButton } from "../components/MeedButton";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MeedInventoryMenu } from "../components/MeedInventoryMenu";
import { MeedLatestRanking } from "../components/MeedLatestRanking";
import { MeedRankingSummary } from "../components/MeedRankingSummary";
import { MeedRankingConfig } from "../components/MeedRankingConfig";
import { MeedCardGridSkeleton } from "../components/MeedSkeletons";
import { meedContextVisual } from "../components/meedContextVisuals";
import { getMeedPath } from "../steps";
import { stepHref } from "../navigation";
import { useMeedSectionStates } from "../meedStatus";
import { useMeedRanking } from "../useMeedRanking";
import { useMeedInventories } from "../useMeedInventories";
import { useMeedContextFacts } from "../useMeedContextFacts";
import { setMeedStepState } from "../meedLocalState";
import {
  emissionsRetrievedState,
  isEmissionsEmpty,
  isEmissionsRetrieved,
} from "../meedEmissions";
import { buildActionIndex } from "./results/components/actionCatalog";
import { ContextCardGrid } from "./results/components/ContextCardGrid";
import type { MeedContextArea } from "./results/components/contextAreas";
import { rankingInsights } from "./results/components/rankingInsights";
import { sectorTagLabel } from "./results/components/actionCatalog";
import { SECTORS } from "@/util/constants";
import {
  excludedActionCount,
  legalFunnel,
  policyBacking,
  readRankingWeights,
} from "./results/components/rankingFacts";

/**
 * Minimum time the retrieve action shows as working. The inventory totals are
 * usually cached and come back instantly, and a button that flips state with
 * no visible work reads as "nothing happened".
 */
const RETRIEVE_MIN_MS = 1500;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The module home.
 *
 * Reads top-down as: which city (hero) → what this module does and the one
 * action that starts it (module block) → the latest result, if any → the
 * context the model ranks against, explorable before and after a run.
 *
 * Emissions data is not a step here: the GHGI card offers "Retrieve emissions
 * data", which pulls the inventory totals CityCatalyst already holds. Until
 * that has happened the primary action is disabled and says why.
 */
export default function MEEDInventoryPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = use(props.params);
  const { t } = useTranslation(lng, "meed");
  const { t: tResults } = useTranslation(lng, "meed-results");
  const { t: tDashboard } = useTranslation(lng, "dashboard");
  const { t: tContext } = useTranslation(lng, "meed-context");
  const router = useRouter();

  const {
    data: inventory,
    isLoading: isInventoryLoading,
    error: inventoryError,
  } = api.useGetInventoryQuery(inventoryId!, { skip: !inventoryId });

  const { data: city, isLoading: isCityLoading } = api.useGetCityQuery(cityId, {
    skip: !cityId,
  });

  const { inventories, isLoading: isInventoriesLoading } =
    useMeedInventories(cityId);

  const { states, isReady } = useMeedSectionStates(inventoryId);

  // Same source as the results screen, so the two can never disagree about
  // whether a ranking exists.
  const { ranking, isStale: isRankingStale } = useMeedRanking(
    inventoryId,
    states,
  );

  const { data: catalog, isLoading: isCatalogLoading } = useGetMeedActionsQuery(
    { cityId },
  );
  const index = useMemo(() => buildActionIndex(catalog), [catalog]);

  const emissionsRetrieved = isEmissionsRetrieved(states.emissions);
  const emissionsEmpty = isEmissionsEmpty(states.emissions);

  const { data: userInfo } = api.useGetUserInfoQuery();
  // `unit` already carries the CO₂e suffix (e.g. "MtCO₂e").
  const formatted = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions, userInfo?.numberFormat)
    : undefined;
  const emissionsText = formatted
    ? `${formatted.value} ${formatted.unit}`.trim()
    : undefined;

  // ── Retrieve emissions data ─────────────────────────────────────────────
  const [fetchResults] = api.useLazyGetResultsQuery();
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrieveFailed, setRetrieveFailed] = useState(false);

  const retrieveEmissions = useCallback(async () => {
    if (!inventoryId || isRetrieving) return;
    setIsRetrieving(true);
    setRetrieveFailed(false);
    try {
      const [results] = await Promise.all([
        fetchResults(inventoryId).unwrap(),
        delay(RETRIEVE_MIN_MS),
      ]);
      setMeedStepState(
        inventoryId,
        "emissions",
        emissionsRetrievedState(results, t),
      );
    } catch {
      setRetrieveFailed(true);
    } finally {
      setIsRetrieving(false);
    }
  }, [inventoryId, isRetrieving, fetchResults, t]);

  // ── Context cards ───────────────────────────────────────────────────────
  const context = useMeedContextFacts({
    lng,
    cityId,
    inventoryId,
    includeEmissions: emissionsRetrieved || emissionsEmpty,
  });
  const ranked = useMemo(() => ranking?.result.ranked_actions ?? [], [ranking]);
  const backing = useMemo(() => policyBacking(ranked), [ranked]);
  const weights = useMemo(
    () => readRankingWeights(ranking?.result ?? null),
    [ranking],
  );
  const excludedCount = excludedActionCount(ranking?.result ?? null);
  const funnel = useMemo(
    () => legalFunnel(ranking?.result ?? null, index.size),
    [ranking, index.size],
  );
  const facts = useMemo(
    () => ({
      emissionsText: emissionsRetrieved ? emissionsText : undefined,
      inventoryYear: inventory?.year ?? undefined,
      rankedCount: ranked.length,
      excludedCount,
      strongPolicyBacking: backing.strong,
      states,
      hasRanking: Boolean(ranking),
      sectorsWithData: emissionsEmpty ? 0 : context.sectorsWithData,
      indicatorCount: context.indicatorCount,
      finance: context.finance,
      legalFunnel: funnel,
      nationalPolicy: context.policy?.national ?? null,
    }),
    [
      emissionsRetrieved,
      emissionsEmpty,
      emissionsText,
      inventory?.year,
      ranked.length,
      ranking,
      excludedCount,
      backing.strong,
      states,
      context,
      funnel,
    ],
  );

  const sectorLabelFor = useCallback(
    (name: string) => tResults(`sector-short-${name}`),
    [tResults],
  );

  const visualFor = useCallback(
    (area: MeedContextArea) =>
      meedContextVisual(area, {
        bySector: context.bySector,
        showEmissions: emissionsRetrieved,
        keyIndicators: context.keyIndicators,
        funnel,
        finance: context.finance,
        policy: context.policy,
        t: tResults,
        tContext,
        sectorLabelFor,
      }),
    [context, emissionsRetrieved, funnel, tResults, tContext, sectorLabelFor],
  );

  // ── Ranking summary ─────────────────────────────────────────────────────
  const insights = useMemo(
    () =>
      ranking
        ? rankingInsights({
            ranked,
            index,
            weights,
            bySector: context.bySector,
            financeRoutes: context.financeRoutes,
          })
        : null,
    [ranking, ranked, index, weights, context.bySector, context.financeRoutes],
  );
  const inventoryYear = inventory?.year;
  const summaryInputs = useMemo(() => {
    const items: string[] = [];
    if (inventoryYear && emissionsText) {
      items.push(
        tResults("summary-input-inventory", {
          year: inventoryYear,
          emissions: emissionsText,
        }),
      );
    }
    if (context.sectorsWithData !== null) {
      items.push(
        tResults("summary-input-sectors", {
          n: context.sectorsWithData,
          total: SECTORS.length,
        }),
      );
    }
    if (context.indicatorCount) {
      items.push(
        tResults("summary-input-indicators", { n: context.indicatorCount }),
      );
    }
    if (context.cityProfileLabel) items.push(context.cityProfileLabel);
    if (index.size) {
      items.push(tResults("summary-input-catalog", { n: index.size }));
    }
    return items;
  }, [inventoryYear, emissionsText, context, index.size, tResults]);

  const ctaFor = useCallback(
    (area: MeedContextArea) => {
      if (area.key !== "emissions") return undefined;
      if (emissionsRetrieved) {
        return {
          label: tResults("context-view-breakdown"),
          href: stepHref(lng, cityId, inventoryId, "emissions"),
        };
      }
      if (emissionsEmpty) {
        // Nothing to rank on: the fix lives in the GHGI module, not here.
        return {
          label: tResults("context-go-to-ghgi"),
          href: `/${lng}/cities/${cityId}/GHGI/${inventoryId}`,
        };
      }
      return {
        label: isRetrieving
          ? tResults("context-retrieving-emissions")
          : tResults("context-retrieve-emissions"),
        onClick: retrieveEmissions,
        isLoading: isRetrieving,
      };
    },
    [
      emissionsRetrieved,
      emissionsEmpty,
      isRetrieving,
      retrieveEmissions,
      tResults,
      lng,
      cityId,
      inventoryId,
    ],
  );

  const onInventorySelect = (item: YearSelectorItem) => {
    router.push(getMeedPath(lng, cityId, item.inventoryId));
  };

  const isLoading = isInventoryLoading || isCityLoading || isInventoriesLoading;

  if (inventoryError || (!isLoading && !inventory)) {
    return (
      <Box
        h="full"
        bg="background.backgroundLight"
        display="flex"
        flexDirection="column"
        alignItems="center"
        py="xxl-7"
        px="l"
        gap="m"
      >
        <HeadlineSmall>{t("inventory-not-found-title")}</HeadlineSmall>
        <BodyLarge color="content.secondary" textAlign="center" maxW="520px">
          {t("inventory-not-found")}
        </BodyLarge>
        <MeedButton
          minW="auto"
          px="l"
          onClick={() => router.push(`/${lng}/cities/${cityId}`)}
        >
          {t("back-to-city")}
        </MeedButton>
      </Box>
    );
  }

  const ctaLabel = isRankingStale
    ? t("ranking-update")
    : ranking
      ? t("ranking-rerun")
      : t("get-recommendations");

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
    >
      <Hero
        variant="compact"
        inventory={inventory ?? null}
        city={city}
        isPublic={false}
        currentInventoryId={inventoryId}
        isInventoryLoading={isLoading}
        formattedEmissions={formatted ?? { value: "", unit: "" }}
        lng={lng}
        moduleLabel={tDashboard("breadcrumb-meed")}
      />

      <Box
        display="flex"
        mx="auto"
        pt="xxl"
        // Clears the fixed "Ask Clima AI" button.
        pb="xxl-6"
        px="l"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="xl"
      >
        {/* Module block: what this is, and the one action that starts it. */}
        <HStack
          justifyContent="space-between"
          alignItems={{ base: "stretch", md: "flex-end" }}
          flexDirection={{ base: "column", md: "row" }}
          gap="l"
          py="l"
        >
          <VStack alignItems="stretch" gap="s" flex="1" minW={0}>
            <HeadlineLarge color="content.primary">
              {t("overview-title")}
            </HeadlineLarge>
            <BodyLarge color="content.secondary" maxW="640px">
              {t("overview-description")}
            </BodyLarge>
          </VStack>
          <VStack
            alignItems={{ base: "stretch", md: "flex-end" }}
            gap="xs"
            flexShrink={0}
          >
            <HStack gap="m" flexWrap="wrap">
              {inventories.length > 0 && (
                <MeedInventoryMenu
                  inventories={inventories}
                  currentInventoryId={inventoryId}
                  onSelect={onInventorySelect}
                  t={t}
                />
              )}
              {/* Preferences are collected on the way (this leads into the
                  wizard), so the only thing that blocks the button is the
                  emissions data it cannot collect for the user. */}
              <MeedButton
                minW="auto"
                px="l"
                disabled={!isReady || !emissionsRetrieved}
                aria-describedby={
                  emissionsRetrieved
                    ? undefined
                    : "meed-get-recommendations-hint"
                }
                onClick={() =>
                  router.push(
                    getMeedPath(lng, cityId, inventoryId, "preferences"),
                  )
                }
              >
                {ctaLabel}
              </MeedButton>
            </HStack>
            {/* The disabled button says why, next to itself — never in a tooltip. */}
            {isReady && !emissionsRetrieved && (
              <Caption
                id="meed-get-recommendations-hint"
                color="content.tertiary"
                textAlign={{ base: "start", md: "end" }}
                maxW="360px"
              >
                {emissionsEmpty
                  ? t("get-recommendations-hint-no-data")
                  : t("get-recommendations-hint")}
              </Caption>
            )}
          </VStack>
        </HStack>

        {/* Once a ranking exists, it — not the setup — is what the user came back for. */}
        {isReady && ranking && insights && (
          <MeedRankingSummary
            insights={insights}
            funnel={funnel}
            backing={backing}
            nationalPolicy={context.policy?.national ?? null}
            inputs={summaryInputs}
            sectorLabelFor={(tag) => sectorTagLabel(tag, tResults)}
            inventorySectorLabelFor={sectorLabelFor}
            t={tResults}
            config={
              <MeedRankingConfig
                inventoryId={inventoryId}
                weights={weights}
                isStale={isRankingStale}
                editHref={stepHref(lng, cityId, inventoryId, "preferences")}
                lng={lng}
              />
            }
          />
        )}
        {isReady && ranking && (
          <MeedLatestRanking
            ranking={ranking}
            index={index}
            isCatalogLoading={isCatalogLoading}
            weights={weights}
            excludedCount={excludedCount}
            isStale={isRankingStale}
            resultsHref={getMeedPath(lng, cityId, inventoryId, "results")}
            onOpenDetail={() =>
              router.push(getMeedPath(lng, cityId, inventoryId, "results"))
            }
            lng={lng}
            t={t}
            tResults={tResults}
          />
        )}

        {/* The context the model ranks against — explorable before and after a run. */}
        {isReady ? (
          <VStack alignItems="stretch" gap="xs">
            <ContextCardGrid
              title={t("how-ranking-works-title")}
              description={t("how-ranking-works-description")}
              facts={facts}
              backing={backing}
              t={tResults}
              hrefFor={(segment) => stepHref(lng, cityId, inventoryId, segment)}
              ctaFor={ctaFor}
              visualFor={visualFor}
            />
            {retrieveFailed && (
              <Caption color="sentiment.negativeDefault" role="alert">
                {t("emissions-error-body")}
              </Caption>
            )}
          </VStack>
        ) : (
          <MeedCardGridSkeleton items={5} />
        )}
      </Box>
    </Box>
  );
}
