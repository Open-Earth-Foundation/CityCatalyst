"use client";
import React, { useMemo } from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import { api, useGetCityPopulationQuery } from "@/services/api";
import { Box, Card, HStack, SimpleGrid, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { formatEmissions } from "@/util/helpers";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import type { YearSelectorItem } from "@/components/shared/YearSelector";
import { MeedPageLayout } from "../MeedPageLayout";
import { MEED_WIZARD_STEPS, getMeedPath } from "../steps";
import { stepHref } from "../navigation";
import { countByStatus, useMeedSectionStates } from "../meedStatus";
import { computeMeedGate } from "../meedGate";
import { useMeedInventories } from "../useMeedInventories";
import { MeedSectionCard } from "../components/MeedSectionCard";
import { MeedGateNotice } from "../components/MeedGateNotice";
import { MeedMeter } from "../components/MeedMeter";
import { MeedInventoryMenu } from "../components/MeedInventoryMenu";
import {
  MeedCardGridSkeleton,
  MeedCardSkeleton,
} from "../components/MeedSkeletons";

export default function MEEDInventoryPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = use(props.params);
  const { t } = useTranslation(lng, "meed");
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
        py="96px"
        px="24px"
        gap="16px"
      >
        <HeadlineSmall>{t("inventory-not-found-title")}</HeadlineSmall>
        <BodyLarge color="content.secondary" textAlign="center" maxW="520px">
          {t("inventory-not-found")}
        </BodyLarge>
        <CCTerraButton
          minW="auto"
          px="24px"
          onClick={() => router.push(`/${lng}/cities/${cityId}`)}
        >
          {t("back-to-city")}
        </CCTerraButton>
      </Box>
    );
  }

  return (
    <MeedPageLayout
      inventory={inventory ?? null}
      formattedEmissions={formattedEmissions}
      lng={lng}
      population={population ?? null}
      city={city}
    >
      {/* What this is, which inventory it runs on, and the one CTA. */}
      <VStack alignItems="stretch" gap="16px">
        <HStack
          justifyContent="space-between"
          alignItems="flex-start"
          gap="24px"
          flexWrap="wrap"
        >
          <Box flex="1" minW="280px">
            <HeadlineSmall>{t("overview-title")}</HeadlineSmall>
            <BodyLarge color="content.secondary" mt="8px">
              {t("overview-description")}
            </BodyLarge>
          </Box>
          <HStack gap="12px" flexShrink={0} alignItems="center">
            {inventories.length > 0 && (
              <MeedInventoryMenu
                inventories={inventories}
                currentInventoryId={inventoryId}
                onSelect={onInventorySelect}
                t={t}
              />
            )}
            <CCTerraButton
              minW="auto"
              px="24px"
              disabled={!gate.canGenerate}
              aria-describedby="meed-gate-notice"
              onClick={() =>
                router.push(getMeedPath(lng, cityId, inventoryId, "preflight"))
              }
            >
              {t("generate-recommendations")}
            </CCTerraButton>
          </HStack>
        </HStack>

        {isReady ? (
          <Card.Root borderColor="border.overlay">
            <Card.Body>
              <VStack alignItems="stretch" gap="12px">
                <HStack
                  justifyContent="space-between"
                  flexWrap="wrap"
                  gap="8px"
                >
                  <TitleMedium color="content.primary">
                    {t("readiness-title")}
                  </TitleMedium>
                  <BodyMedium color="content.tertiary">
                    {counts.complete + counts.needsReview + counts.inProgress ===
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
                <MeedGateNotice gate={gate} t={t} id="meed-gate-notice" />
              </VStack>
            </Card.Body>
          </Card.Root>
        ) : (
          <MeedCardSkeleton lines={3} />
        )}
      </VStack>

      {/* Inputs — reachable in any order. */}
      <VStack alignItems="stretch" gap="12px" mt="8px">
        <Box>
          <TitleMedium color="content.primary">
            {t("overview-sections-title")}
          </TitleMedium>
          <BodyMedium color="content.secondary" mt="4px">
            {t("overview-sections-description")}
          </BodyMedium>
        </Box>

        {isReady ? (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="16px">
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
    </MeedPageLayout>
  );
}
