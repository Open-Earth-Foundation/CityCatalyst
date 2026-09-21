"use client";
import React, { useMemo } from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetCityPopulationQuery,
  useGetMeedActionsQuery,
} from "@/services/api";
import { Box, Card, HStack, SimpleGrid, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { formatEmissions } from "@/util/helpers";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { MeedButton } from "../components/MeedButton";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MeedModuleHeader } from "../components/MeedModuleHeader";
import { MeedRankingCard } from "../components/MeedRankingCard";
import { MEED_WIZARD_STEPS, getMeedPath } from "../steps";
import { stepHref } from "../navigation";
import { countByStatus, useMeedSectionStates } from "../meedStatus";
import { useMeedRanking } from "../useMeedRanking";
import { buildActionIndex } from "./results/components/actionCatalog";
import { computeMeedGate } from "../meedGate";
import { useMeedInventories } from "../useMeedInventories";
import { MeedSectionCard } from "../components/MeedSectionCard";
import { MeedGateNotice } from "../components/MeedGateNotice";
import { MeedMeter } from "../components/MeedMeter";
import {
  MeedCardGridSkeleton,
  MeedCardSkeleton,
} from "../components/MeedSkeletons";

export default function MEEDInventoryPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = use(props.params);
  const { t } = useTranslation(lng, "meed");
  const { t: tDashboard } = useTranslation(lng, "dashboard");
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

  // Resolve the highest-ranked action names from the live catalog rather than
  // storing copies of them alongside the ranking.
  const { data: catalog } = useGetMeedActionsQuery({ cityId });
  const topActions = useMemo(() => {
    if (!ranking) return [];
    const index = buildActionIndex(catalog);
    return (ranking.result.ranked_actions ?? [])
      .slice(0, 3)
      .map((a) => index.get(a.action_id)?.actionName ?? a.action_id);
  }, [ranking, catalog]);
  const counts = useMemo(() => countByStatus(states), [states]);
  const gate = useMemo(() => computeMeedGate(states), [states]);

  const { data: userInfo } = api.useGetUserInfoQuery();
  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions, userInfo?.numberFormat)
    : { value: t("not-available"), unit: "" };

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );

  // Pre-flight is the review step, not an input, so it doesn't count towards
  // how ready the city is.
  const inputSteps = useMemo(
    () => MEED_WIZARD_STEPS.filter((s) => s.key !== "preflight"),
    [],
  );
  const settled = inputSteps.filter((s) => {
    const status = states[s.key]?.status;
    return status === "complete" || status === "needs-review";
  }).length;
  const overallProgress = inputSteps.length ? settled / inputSteps.length : 0;

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

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
    >
      <MeedModuleHeader
        moduleLabel={tDashboard("breadcrumb-meed")}
        title={t("overview-title")}
        cityName={city?.name ?? inventory?.city?.name}
        emissions={inventory?.totalEmissions ? formattedEmissions : undefined}
        inventoryYear={inventory?.year ?? undefined}
        inventories={inventories}
        currentInventoryId={inventoryId}
        onInventorySelect={onInventorySelect}
        cityHref={`/${lng}/cities/${cityId}`}
        toolsLabel={tDashboard("breadcrumb-tools")}
        t={t}
        action={
          <MeedButton
            minW="auto"
            px="l"
            disabled={!gate.canGenerate}
            aria-describedby="meed-gate-notice"
            onClick={() =>
              router.push(getMeedPath(lng, cityId, inventoryId, "preflight"))
            }
          >
            {ranking ? t("ranking-rerun") : t("generate-recommendations")}
          </MeedButton>
        }
      />

      <Box
        display="flex"
        mx="auto"
        py="xxl"
        px="l"
        w="full"
        maxW="1090px"
        flexDirection="column"
        gap="xl"
      >
        <VStack alignItems="stretch" gap="m">
          <BodyLarge color="content.secondary">
            {t("overview-description")}
          </BodyLarge>

          {/* Once a ranking exists, it — not the setup — is what the user came back for. */}
          {isReady && ranking && (
            <MeedRankingCard
              ranking={ranking}
              topActions={topActions}
              isStale={isRankingStale}
              resultsHref={getMeedPath(lng, cityId, inventoryId, "results")}
              onRerun={() =>
                router.push(getMeedPath(lng, cityId, inventoryId, "preflight"))
              }
              lng={lng}
              t={t}
            />
          )}

          {isReady ? (
            <Card.Root borderColor="border.overlay">
              <Card.Body>
                <VStack alignItems="stretch" gap="m">
                  <HStack
                    justifyContent="space-between"
                    flexWrap="wrap"
                    gap="s"
                  >
                    <TitleMedium color="content.primary">
                      {t("readiness-title")}
                    </TitleMedium>
                    <BodyMedium color="content.tertiary">
                      {counts.complete +
                        counts.needsReview +
                        counts.inProgress ===
                      0
                        ? t("sections-none-started")
                        : t("sections-rollup", {
                            complete: counts.complete,
                            inProgress: counts.inProgress,
                            notStarted: counts.notStarted,
                          })}
                    </BodyMedium>
                  </HStack>
                  <MeedMeter
                    value={overallProgress}
                    tone={gate.canGenerate ? "positive" : "warning"}
                    ariaLabel={t("readiness-title")}
                  />
                  <MeedGateNotice
                    gate={gate}
                    lng={lng}
                    cityId={cityId}
                    inventoryId={inventoryId}
                    from="overview"
                    id="meed-gate-notice"
                  />
                </VStack>
              </Card.Body>
            </Card.Root>
          ) : (
            <MeedCardSkeleton lines={3} />
          )}
        </VStack>

        {/* Inputs — reachable in any order. */}
        <VStack alignItems="stretch" gap="m">
          <Box>
            <TitleMedium color="content.primary">
              {t("overview-sections-title")}
            </TitleMedium>
            <BodyMedium color="content.secondary" mt="xs">
              {t("overview-sections-description")}
            </BodyMedium>
          </Box>

          {isReady ? (
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="m">
              {inputSteps.map((step) => (
                <MeedSectionCard
                  key={step.key}
                  step={step}
                  state={states[step.key]}
                  href={stepHref(lng, cityId, inventoryId, step.segment)}
                  t={t}
                />
              ))}
            </SimpleGrid>
          ) : (
            <MeedCardGridSkeleton items={6} />
          )}
        </VStack>
      </Box>
    </Box>
  );
}
