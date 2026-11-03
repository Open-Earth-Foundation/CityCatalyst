"use client";
import React, { useEffect, useMemo } from "react";
import { Box, Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuCircleCheck, LuScale } from "react-icons/lu";
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
import { TitleMedium } from "@/components/package/Texts/Title";
import { LabelMedium } from "@/components/package/Texts/Label";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MeedStatusTag } from "../../components/MeedStatusTag";
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
import {
  LEGAL_CATEGORY_ORDER,
  LEGAL_CATEGORY_TONE,
  legalCategoryLabelKey,
  type MeedLegalCategory,
} from "./legalStanding";

/** Label / value line inside a card. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap="s" alignItems="baseline" flexWrap="wrap">
      <Caption color="content.tertiary">{label}</Caption>
      <BodySmall color="content.secondary">{value}</BodySmall>
    </HStack>
  );
}

/**
 * One screened action. Ranked actions carry their legal standing; actions the
 * backend removed before scoring carry the removal reasons instead. Both use
 * the same card so the page reads as one list.
 */
function ScreenedActionCard({
  action,
  category,
  t,
}: {
  action: LegalScreenedAction;
  /** Omitted for an action removed before scoring. */
  category?: MeedLegalCategory;
  t: TFunction;
}) {
  const standing = action.standing;
  return (
    <Card.Root borderColor="border.overlay">
      <Card.Body>
        <VStack alignItems="stretch" gap="s">
          <HStack gap="s" flexWrap="wrap" alignItems="center">
            {action.rank !== undefined && (
              <BodyMedium color="content.link" fontWeight="bold">
                #{action.rank}
              </BodyMedium>
            )}
            <BodyMedium color="content.primary" fontWeight="bold" flex="1">
              {action.actionName}
            </BodyMedium>
            {action.sector && (
              <MeedStatusTag tone="neutral">
                {action.sector.replace(/_/g, " ")}
              </MeedStatusTag>
            )}
            {category ? (
              <MeedStatusTag tone={LEGAL_CATEGORY_TONE[category]}>
                {t(legalCategoryLabelKey(category))}
              </MeedStatusTag>
            ) : (
              <MeedStatusTag tone="negative">{t("excluded-tag")}</MeedStatusTag>
            )}
          </HStack>

          {standing && (
            <VStack alignItems="stretch" gap="xs">
              <Fact
                label={t("verdict-label")}
                value={t(legalCategoryLabelKey(standing.verdict))}
              />
              {standing.score !== null && (
                <Fact
                  label={t("score-label")}
                  value={standing.score.toFixed(2)}
                />
              )}
              {standing.ownershipDescription && (
                <BodySmall color="content.secondary">
                  {standing.ownershipDescription}
                </BodySmall>
              )}
              {standing.justification && (
                <Box pt="xs">
                  <Overline color="content.tertiary">
                    {t("reasons-label")}
                  </Overline>
                  <BodySmall color="content.secondary">
                    {standing.justification}
                  </BodySmall>
                </Box>
              )}
              {standing.references.length > 0 && (
                <Box pt="xs">
                  <Overline color="content.tertiary">
                    {t("references-label")}
                  </Overline>
                  {standing.references.map((ref, i) => (
                    <BodySmall key={i} color="content.secondary">
                      {ref}
                    </BodySmall>
                  ))}
                </Box>
              )}
            </VStack>
          )}

          {!standing && !!action.reasons?.length && (
            <VStack alignItems="stretch" gap="xs">
              <Overline color="content.tertiary">
                {t("excluded-reasons-label")}
              </Overline>
              {action.reasons.map((reason, i) => (
                <BodySmall key={i} color="content.secondary">
                  {reason}
                </BodySmall>
              ))}
            </VStack>
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

  // Legal standing is produced by the prioritizer, so it lives on the stored
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
  const { groups, excludedBeforeScoring, isEmpty } = screening;
  const hasScreening = Boolean(ranking) && !isEmpty;
  const counts = {
    blocked: groups.blocked.length,
    conditional: groups.conditional.length,
    enabled: groups.enabled.length,
    not_assessed: groups.not_assessed.length,
  };
  const assessedCount = counts.blocked + counts.conditional + counts.enabled;
  // The all-clear card needs a positive signal: at least one action assessed
  // as enabled, and nothing blocked, conditional, unassessed or excluded.
  // A ranking whose legal data is all neutral fallbacks is not "all clear".
  const allEnabled =
    counts.enabled > 0 &&
    counts.blocked +
      counts.conditional +
      counts.not_assessed +
      excludedBeforeScoring.length ===
      0;

  // Report progress only once there is something to report.
  //
  // This previously wrote `progress: 100` unconditionally on mount, with no
  // data behind it — which meant merely opening the URL satisfied one of the
  // three sections `computeMeedGate` requires before the ranking can be
  // generated. Visiting a screen is not the same as having screened anything.
  const stepSub = !hasScreening
    ? t("step-sub")
    : assessedCount > 0
      ? t("step-sub-counts", counts)
      : t("step-sub-not-assessed", { count: counts.not_assessed });
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
          <Card.Root borderColor="border.overlay">
            <Card.Body>
              <VStack alignItems="stretch" gap="m">
                <Box>
                  <TitleMedium color="content.primary">
                    {t("summary-title")}
                  </TitleMedium>
                  <BodySmall color="content.secondary" mt="xs">
                    {t("summary-body", {
                      count: screening.includedCount,
                    })}
                  </BodySmall>
                </Box>
                <HStack gap="s" flexWrap="wrap">
                  {LEGAL_CATEGORY_ORDER.filter((c) => counts[c] > 0).map(
                    (c) => (
                      <MeedStatusTag key={c} tone={LEGAL_CATEGORY_TONE[c]}>
                        {t(legalCategoryLabelKey(c))} · {counts[c]}
                      </MeedStatusTag>
                    ),
                  )}
                  {excludedBeforeScoring.length > 0 && (
                    <MeedStatusTag tone="negative">
                      {t("excluded-tag")} · {excludedBeforeScoring.length}
                    </MeedStatusTag>
                  )}
                </HStack>
              </VStack>
            </Card.Body>
          </Card.Root>

          {allEnabled && (
            <Card.Root borderColor="border.neutral">
              <Card.Body>
                <VStack gap="s" py="l" px="l" textAlign="center">
                  <Icon
                    as={LuCircleCheck}
                    boxSize="28px"
                    color="sentiment.positiveDefault"
                  />
                  <TitleMedium color="content.primary">
                    {t("all-enabled-title")}
                  </TitleMedium>
                  <BodyMedium color="content.secondary">
                    {t("all-enabled-body")}
                  </BodyMedium>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          {LEGAL_CATEGORY_ORDER.filter((c) => groups[c].length > 0).map(
            (category) => (
              <VStack key={category} alignItems="stretch" gap="m">
                <Box>
                  <TitleMedium color="content.primary">
                    {t(`section-${category.replace("_", "-")}`, {
                      count: groups[category].length,
                    })}
                  </TitleMedium>
                  <BodySmall color="content.secondary" mt="xs">
                    {t(`section-${category.replace("_", "-")}-description`)}
                  </BodySmall>
                </Box>
                {groups[category].map((action) => (
                  <ScreenedActionCard
                    key={action.actionId}
                    action={action}
                    category={category}
                    t={t}
                  />
                ))}
              </VStack>
            ),
          )}

          {excludedBeforeScoring.length > 0 && (
            <VStack alignItems="stretch" gap="m">
              <Box>
                <TitleMedium color="content.primary">
                  {t("excluded-section-title", {
                    count: excludedBeforeScoring.length,
                  })}
                </TitleMedium>
                <BodySmall color="content.secondary" mt="xs">
                  {t("excluded-section-description")}
                </BodySmall>
              </Box>
              {excludedBeforeScoring.map((action) => (
                <ScreenedActionCard
                  key={action.actionId}
                  action={action}
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
