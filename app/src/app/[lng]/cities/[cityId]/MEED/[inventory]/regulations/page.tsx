"use client";
import React, { useEffect, useMemo } from "react";
import { Box, Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import {
  LuCircleCheck,
  LuCircleX,
  LuScale,
  LuTriangleAlert,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import { useGetMeedActionsQuery } from "@/services/api";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { LabelMedium } from "@/components/package/Texts/Label";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MeedStatusTag, type MeedTone } from "../../components/MeedStatusTag";
import { setMeedStepState } from "../../meedLocalState";
import { useMeedSectionStates } from "../../meedStatus";
import { useMeedRanking } from "../../useMeedRanking";
import { MeedCardSkeleton } from "../../components/MeedSkeletons";
import { MeedErrorCard } from "../../components/MeedErrorCard";
import { buildActionIndex } from "../results/components/actionCatalog";
import {
  deriveLegalScreening,
  type LegalScreenedAction,
} from "./legalScreening";

/** Screening verdict for an action that did not pass cleanly. */
type ScreenedStatus = "blocked" | "flagged";

const STATUS_TONE: Record<ScreenedStatus, MeedTone> = {
  blocked: "negative",
  flagged: "warning",
};

const STATUS_TAG_KEY: Record<ScreenedStatus, string> = {
  blocked: "excluded-tag",
  flagged: "flagged-tag",
};

function SummaryCard({
  count,
  label,
  sublabel,
  icon,
  countColor,
}: {
  count: number;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  countColor: string;
}) {
  return (
    <Card.Root borderColor="border.overlay" h="full">
      <Card.Body>
        <VStack alignItems="flex-start" gap="xs">
          <Overline color="content.tertiary">{label}</Overline>
          <HStack gap="s" alignItems="center">
            <TitleLarge color={countColor} fontVariantNumeric="tabular-nums">
              {count}
            </TitleLarge>
            <Icon as={icon} boxSize="18px" color={countColor} />
          </HStack>
          <Caption color="content.secondary">{sublabel}</Caption>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

/**
 * One screened action. Blocked and flagged actions differ only in tone, tag and
 * body copy, so they share a single card rather than two near-identical ones.
 */
function ScreenedActionCard({
  action,
  status,
  t,
}: {
  action: LegalScreenedAction;
  status: ScreenedStatus;
  t: TFunction;
}) {
  const hasReasons = status === "blocked" && !!action.reasons?.length;

  return (
    <Card.Root borderColor="border.overlay">
      <Card.Body>
        <VStack alignItems="stretch" gap="s">
          <HStack gap="s" flexWrap="wrap" alignItems="center">
            <BodyMedium color="content.primary" fontWeight="bold" flex="1">
              {action.actionName}
            </BodyMedium>
            {action.sector && (
              <MeedStatusTag tone="neutral">
                {action.sector.replace(/_/g, " ")}
              </MeedStatusTag>
            )}
            <MeedStatusTag tone={STATUS_TONE[status]}>
              {t(STATUS_TAG_KEY[status])}
            </MeedStatusTag>
          </HStack>
          {hasReasons ? (
            <VStack alignItems="stretch" gap="xs">
              <Overline color="content.tertiary">{t("reasons-label")}</Overline>
              {action.reasons!.map((reason, i) => (
                <BodySmall key={i} color="content.secondary">
                  {reason}
                </BodySmall>
              ))}
            </VStack>
          ) : (
            status === "flagged" && (
              <BodySmall color="content.secondary">
                {t("flagged-card-body")}
              </BodySmall>
            )
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function RegulationsContent({
  lng,
  cityId,
  inventoryId,
}: {
  lng: string;
  cityId: string;
  inventoryId: string;
}) {
  const { t } = useTranslation(lng, "meed-regulations");

  // Legal screening is produced by the prioritizer, so it lives on the stored
  // ranking. `useMeedRanking` is the module's single read point for that.
  const { states } = useMeedSectionStates(inventoryId);
  const { ranking, isReady } = useMeedRanking(inventoryId, states);
  const {
    data: catalog,
    isLoading: isCatalogLoading,
    isError: isCatalogError,
    refetch: refetchCatalog,
  } = useGetMeedActionsQuery({ cityId });

  const screening = useMemo(
    () => deriveLegalScreening(ranking?.result, buildActionIndex(catalog), lng),
    [ranking, catalog, lng],
  );
  const { blocked, flagged, includedCount, isEmpty } = screening;
  const hasScreening = Boolean(ranking) && !isEmpty;

  // Report progress only once there is something to report.
  //
  // This previously wrote `progress: 100` unconditionally on mount, with no
  // data behind it — which meant merely opening the URL satisfied one of the
  // three sections `computeMeedGate` requires before the ranking can be
  // generated. Visiting a screen is not the same as having screened anything.
  const stepSub = hasScreening
    ? t("step-sub-counts", {
        excluded: blocked.length,
        included: includedCount,
      })
    : t("step-sub");
  useEffect(() => {
    if (!inventoryId || !isReady) return;
    setMeedStepState(
      inventoryId,
      "regulations",
      hasScreening
        ? { visited: true, progress: 100, sub: stepSub }
        : { visited: true },
    );
  }, [inventoryId, isReady, hasScreening, stepSub]);

  return (
    <VStack alignItems="stretch" gap="l">
      <VStack alignItems="stretch" gap="m">
        <BodyLarge color="content.secondary">{t("intro")}</BodyLarge>
        <HStack
          gap="s"
          bg="background.neutral"
          borderRadius="rounded"
          px="m"
          py="s"
          alignSelf="flex-start"
        >
          <Icon as={LuScale} boxSize="14px" color="content.secondary" />
          <Caption color="content.secondary">{t("feasibility-note")}</Caption>
        </HStack>
      </VStack>

      {/*
        Until the ranking has been read and the catalog has arrived we know
        nothing — showing the "no screening yet" card in the meantime tells a
        user who *does* have a ranking the opposite of the truth, then swaps it
        out a frame later.
      */}
      {!isReady || isCatalogLoading ? (
        <MeedCardSkeleton lines={6} />
      ) : isCatalogError ? (
        <MeedErrorCard
          title={t("error-title")}
          body={t("error-body")}
          retryLabel={t("error-retry")}
          onRetry={() => refetchCatalog()}
        />
      ) : !hasScreening ? (
        <Card.Root borderColor="border.neutral">
          <Card.Body>
            <VStack gap="m" py="xxl" px="l" textAlign="center">
              <Icon as={LuScale} boxSize="32px" color="content.tertiary" />
              <TitleMedium color="content.primary">
                {t("precondition-title")}
              </TitleMedium>
              <BodyMedium color="content.secondary" maxW="520px">
                {t("precondition-body")}
              </BodyMedium>
              <LabelMedium color="content.tertiary">
                {t("precondition-continue")}
              </LabelMedium>
            </VStack>
          </Card.Body>
        </Card.Root>
      ) : (
        <>
          <SimpleGrid columns={{ base: 1, md: 3 }} gap="m">
            <SummaryCard
              count={includedCount}
              label={t("summary-included")}
              sublabel={t("summary-included-sub")}
              icon={LuCircleCheck}
              countColor="sentiment.positiveDefault"
            />
            <SummaryCard
              count={blocked.length}
              label={t("summary-blocked")}
              sublabel={t("summary-blocked-sub")}
              icon={LuCircleX}
              countColor="sentiment.negativeDefault"
            />
            <SummaryCard
              count={flagged.length}
              label={t("summary-flagged")}
              sublabel={t("summary-flagged-sub")}
              icon={LuTriangleAlert}
              countColor="sentiment.warningDefault"
            />
          </SimpleGrid>

          {blocked.length === 0 && flagged.length === 0 && (
            <Card.Root borderColor="border.neutral">
              <Card.Body>
                <VStack gap="s" py="l" px="l" textAlign="center">
                  <Icon
                    as={LuCircleCheck}
                    boxSize="28px"
                    color="sentiment.positiveDefault"
                  />
                  <TitleMedium color="content.primary">
                    {t("all-passed-title")}
                  </TitleMedium>
                  <BodyMedium color="content.secondary">
                    {t("all-passed-body")}
                  </BodyMedium>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          {blocked.length > 0 && (
            <VStack alignItems="stretch" gap="m">
              <Box>
                <TitleMedium color="content.primary">
                  {t("blocked-section-title", { count: blocked.length })}
                </TitleMedium>
                <BodySmall color="content.secondary" mt="xs">
                  {t("blocked-section-description")}
                </BodySmall>
              </Box>
              {blocked.map((action) => (
                <ScreenedActionCard
                  key={action.actionId}
                  action={action}
                  status="blocked"
                  t={t}
                />
              ))}
            </VStack>
          )}

          {flagged.length > 0 && (
            <VStack alignItems="stretch" gap="m">
              <Box>
                <TitleMedium color="content.primary">
                  {t("flagged-section-title", { count: flagged.length })}
                </TitleMedium>
                <BodySmall color="content.secondary" mt="xs">
                  {t("flagged-section-description")}
                </BodySmall>
              </Box>
              {flagged.map((action) => (
                <ScreenedActionCard
                  key={action.actionId}
                  action={action}
                  status="flagged"
                  t={t}
                />
              ))}
            </VStack>
          )}
        </>
      )}
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="regulations">
      <RegulationsContent lng={lng} cityId={cityId} inventoryId={inventoryId} />
    </MeedWizardPage>
  );
}
