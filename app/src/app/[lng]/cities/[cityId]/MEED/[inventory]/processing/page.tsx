"use client";
import React, { useEffect, useRef, useState } from "react";
import { Box, Card, HStack, Icon, Spinner, VStack } from "@chakra-ui/react";
import { LuCircleAlert, LuCircleCheck } from "react-icons/lu";
import { useRouter } from "next/navigation";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import { MeedButton } from "../../components/MeedButton";
import {
  useGetMeedActionsQuery,
  useRunMeedRankingMutation,
} from "@/services/api";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { getMeedPath } from "../../steps";
import {
  getMeedConfirmedExclusions,
  getMeedPreferences,
  setMeedRanking,
} from "../../meedLocalState";
import { buildRunRankingRequest } from "../../meedRankingRequest";
import {
  rankingGeneratedAt,
  toMeedPrioritizeCityResult,
} from "../../meedRankingAdapter";
import { useMeedSectionStates, inputsFingerprint } from "../../meedStatus";
import { computeMeedGate } from "../../meedGate";
import { buildMockRanking } from "../../meedMockRanking";
import { buildActionIndex } from "../results/components/actionCatalog";
import { api } from "@/services/api";

/** Total scripted animation time before navigating to the results screen. */
const ANIMATION_MS = 8000;
/**
 * Where the scripted curve stops when a real request is in flight.
 *
 * The clock must never reach 100 on its own: only the resolved response is
 * allowed to say the ranking is done. Parking just short of the end reads as
 * "nearly there" rather than as a stall.
 */
const REQUEST_CEILING_PCT = 90;
/** Delay after completion before navigating, so the "done" state is visible. */
const NAVIGATE_DELAY_MS = 900;

/** Stage boundaries in overall progress (0–100). */
const BOUNDARIES = [0, 10, 62, 84, 100];

/** Stage ids; label/description i18n keys are `stage-<id>` / `stage-<id>-desc`. */
const STAGES = ["validation", "impact", "alignment", "feasibility"] as const;

type StageStatus = "pending" | "running" | "complete";

function stageStatus(idx: number, overall: number): StageStatus {
  if (overall >= BOUNDARIES[idx + 1]) return "complete";
  if (overall >= BOUNDARIES[idx]) return "running";
  return "pending";
}

function stageProgress(idx: number, overall: number): number {
  const start = BOUNDARIES[idx];
  const end = BOUNDARIES[idx + 1];
  if (overall >= end) return 100;
  if (overall < start) return 0;
  return Math.round(((overall - start) / (end - start)) * 100);
}

function currentStageKey(overall: number): string {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (overall >= BOUNDARIES[i]) return `stage-${STAGES[i]}`;
  }
  return `stage-${STAGES[0]}`;
}

function StageRow({
  stageId,
  status,
  pct,
  t,
}: {
  stageId: (typeof STAGES)[number];
  status: StageStatus;
  pct: number;
  t: TFunction;
}) {
  return (
    <HStack
      alignItems="flex-start"
      gap="m"
      px="l"
      py="m"
      borderTopWidth="1px"
      borderColor="border.overlay"
    >
      <Box flexShrink={0} mt="xs">
        {status === "complete" && (
          <Icon
            as={LuCircleCheck}
            boxSize="20px"
            color="sentiment.positiveDefault"
          />
        )}
        {status === "running" && <Spinner size="sm" color="content.link" />}
        {status === "pending" && (
          <Box
            w="20px"
            h="20px"
            borderRadius="full"
            borderWidth="2px"
            borderColor="border.overlay"
          />
        )}
      </Box>
      <VStack alignItems="stretch" gap="xs" flex="1" minW="0">
        <HStack justifyContent="space-between">
          <LabelMedium
            color={
              status === "pending" ? "content.tertiary" : "content.primary"
            }
          >
            {t(`stage-${stageId}`)}
          </LabelMedium>
          {status !== "pending" && (
            <BodySmall
              color={
                status === "complete"
                  ? "sentiment.positiveDefault"
                  : "content.secondary"
              }
              fontVariantNumeric="tabular-nums"
            >
              {pct}%
            </BodySmall>
          )}
        </HStack>
        <BodySmall
          color={
            status === "pending" ? "content.tertiary" : "content.secondary"
          }
        >
          {t(`stage-${stageId}-desc`)}
        </BodySmall>
        {status === "running" && (
          <Box
            mt="s"
            h="4px"
            bg="background.neutral"
            borderRadius="full"
            overflow="hidden"
          >
            <Box
              h="full"
              w={`${pct}%`}
              bg="content.link"
              borderRadius="full"
              transition="width 0.3s ease"
            />
          </Box>
        )}
      </VStack>
    </HStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  const { t } = useTranslation(lng, "meed-processing");
  const router = useRouter();

  const [overall, setOverall] = useState(0);
  const [done, setDone] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startTime = useRef(Date.now());
  const mockWritten = useRef(false);
  const runStarted = useRef(false);

  const isMockMode = hasFeatureFlag(FeatureFlags.MEED_MOCK_RANKING);

  // Review aid only: with MEED_MOCK_RANKING on, completing this screen stores a
  // ranking built from the live action catalog so the results screens can be
  // exercised before the prioritization service exists. Off by default.
  const { states, isReady: statesReady } = useMeedSectionStates(inventoryId);

  /**
   * A URL must not be able to start a ranking the inputs cannot support.
   *
   * The screen fires a real request on mount, so reaching it directly without
   * the readiness gate passing would spend a full prioritization run — and land
   * the user on results with nothing to show. Waits for the store to be read
   * before judging, or it would bounce on first paint.
   */
  const gateBlocked = statesReady && !computeMeedGate(states).canGenerate;
  useEffect(() => {
    if (gateBlocked) {
      router.replace(getMeedPath(lng, cityId, inventoryId, "preflight"));
    }
  }, [gateBlocked, router, lng, cityId, inventoryId]);
  const { data: catalog } = useGetMeedActionsQuery({ cityId });
  const { data: inventory } = api.useGetInventoryQuery(inventoryId, {
    skip: !inventoryId,
  });

  /**
   * Scripted progress, ease-in-out.
   *
   * With the mock flag on this is the whole story and still completes on the
   * clock. Against the real service the curve is only a waiting animation: it
   * stops at REQUEST_CEILING_PCT and the response decides the ending, so the
   * screen can never claim a ranking finished when the request is still open
   * — or, worse, when it failed.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      const raw = elapsed / ANIMATION_MS;
      const eased = Math.min(
        raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw,
        0.99,
      );
      const pct = Math.round(eased * 100);

      if (!isMockMode) {
        setOverall(Math.min(pct, REQUEST_CEILING_PCT));
        if (elapsed >= ANIMATION_MS) clearInterval(interval);
        return;
      }

      setOverall(pct);
      if (elapsed >= ANIMATION_MS) {
        clearInterval(interval);
        setOverall(100);
        setDone(true);
      }
    }, 60);
    return () => clearInterval(interval);
  }, [isMockMode, attempt]);

  // Read inside the request callback without making the request depend on
  // them — the fingerprint is a snapshot taken as the ranking is stored.
  const statesRef = useRef(states);
  const locodeRef = useRef("");
  useEffect(() => {
    statesRef.current = states;
    locodeRef.current = inventory?.city?.locode ?? "";
  });

  const [runMeedRanking] = useRunMeedRankingMutation();

  /**
   * Run the ranking, exactly once per attempt.
   *
   * The one-shot ref matters more than it looks: storing the result dispatches
   * a state-changed event, which recreates `states`, which would otherwise
   * re-enter here and fire a second full ranking.
   */
  useEffect(() => {
    if (isMockMode || runStarted.current || !cityId || !inventoryId) return;
    if (!statesReady || gateBlocked) return;
    runStarted.current = true;

    const body = buildRunRankingRequest({
      inventoryId,
      preferences: getMeedPreferences(inventoryId),
      // The exclusions the user reviewed and confirmed on pre-flight — never
      // the raw criteria.
      excludedActionIds: getMeedConfirmedExclusions(inventoryId),
    });

    let cancelled = false;
    runMeedRanking({ cityId, body })
      .unwrap()
      .then((payload) => {
        if (cancelled) return;
        const result = toMeedPrioritizeCityResult(payload, {
          locode: locodeRef.current,
        });
        // A 200 that carries no ranked actions is not a ranking. Treating it as
        // success would store an empty result and send the user to a results
        // screen with nothing on it — the error state is the honest answer.
        if ((result.ranked_actions?.length ?? 0) === 0) {
          setHasError(true);
          return;
        }
        setMeedRanking(inventoryId, {
          result,
          generatedAtUtc:
            rankingGeneratedAt(payload) ?? new Date().toISOString(),
          inputsFingerprint: inputsFingerprint(statesRef.current),
          isMock: false,
        });
        setOverall(100);
        setDone(true);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isMockMode,
    cityId,
    inventoryId,
    runMeedRanking,
    attempt,
    statesReady,
    gateBlocked,
  ]);

  function retryRanking() {
    runStarted.current = false;
    startTime.current = Date.now();
    setHasError(false);
    setOverall(0);
    setDone(false);
    setAttempt((n) => n + 1);
  }

  // Navigate to the results screen shortly after the animation completes.
  // A failed ranking never gets here: there would be nothing to show.
  useEffect(() => {
    if (!done || hasError) return;

    // Guarded: storing the ranking dispatches a state-changed event, which
    // recreates `states`, which would re-enter this effect forever.
    if (!mockWritten.current && isMockMode && catalog) {
      mockWritten.current = true;
      const result = buildMockRanking(buildActionIndex(catalog), {
        locode: inventory?.city?.locode ?? "",
      });
      if (result) {
        setMeedRanking(inventoryId, {
          result,
          generatedAtUtc: new Date().toISOString(),
          inputsFingerprint: inputsFingerprint(states),
          isMock: true,
        });
      }
    }

    const timeout = setTimeout(
      () => router.push(`/${lng}/cities/${cityId}/MEED/${inventoryId}/results`),
      NAVIGATE_DELAY_MS,
    );
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `states` is read
    // once behind the one-shot guard above; including it would re-enter.
  }, [
    done,
    hasError,
    isMockMode,
    router,
    lng,
    cityId,
    inventoryId,
    catalog,
    inventory,
  ]);

  const displayPct = done ? 100 : overall;

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
      alignItems="center"
      py="xxl-2"
      px="l"
    >
      <Card.Root maxW="620px" w="full" overflow="hidden">
        {/* Header */}
        <HStack
          gap="m"
          px="l"
          py="m"
          bg="background.neutral"
          borderBottomWidth="1px"
          borderColor="border.overlay"
        >
          {hasError ? (
            <Icon
              as={LuCircleAlert}
              boxSize="36px"
              color="sentiment.negativeDefault"
            />
          ) : done ? (
            <Icon
              as={LuCircleCheck}
              boxSize="36px"
              color="sentiment.positiveDefault"
            />
          ) : (
            <Spinner size="lg" color="content.link" />
          )}
          <VStack alignItems="flex-start" gap="xs">
            <TitleMedium
              color={
                hasError
                  ? "sentiment.negativeDefault"
                  : done
                    ? "sentiment.positiveDefault"
                    : "content.primary"
              }
            >
              {hasError
                ? t("header-error")
                : done
                  ? t("header-done")
                  : t("header-running")}
            </TitleMedium>
            <BodySmall color="content.secondary">
              {hasError ? t("error-sub") : t("header-sub")}
            </BodySmall>
          </VStack>
        </HStack>

        {/* Overall progress */}
        <Box px="l" pt="m">
          <Box
            h="6px"
            bg="background.neutral"
            borderRadius="full"
            overflow="hidden"
          >
            <Box
              h="full"
              w={`${displayPct}%`}
              bg={
                hasError
                  ? "sentiment.negativeDefault"
                  : done
                    ? "sentiment.positiveDefault"
                    : "content.link"
              }
              borderRadius="full"
              transition="width 0.2s ease, background 0.4s ease"
            />
          </Box>
          <BodySmall
            color="content.secondary"
            mt="s"
            mb="xs"
            aria-live="polite"
          >
            {t("percent-complete", { pct: displayPct })}
            {" — "}
            {hasError
              ? t("error-stopped")
              : done
                ? t("all-complete")
                : t("stage-in-progress", {
                    stage: t(currentStageKey(displayPct)),
                  })}
          </BodySmall>
        </Box>

        {/* Stage rows */}
        <Box pt="xs">
          {STAGES.map((stageId, i) => {
            const status = done ? "complete" : stageStatus(i, displayPct);
            return (
              <StageRow
                key={stageId}
                stageId={stageId}
                // A spinner after a failure would claim work is still going on.
                status={hasError && status === "running" ? "pending" : status}
                pct={done ? 100 : stageProgress(i, displayPct)}
                t={t}
              />
            );
          })}
        </Box>

        {/* Footer */}
        {hasError ? (
          <VStack
            alignItems="stretch"
            gap="m"
            mx="m"
            mb="m"
            mt="m"
            bg="sentiment.negativeOverlay"
            borderRadius="rounded"
            px="m"
            py="m"
          >
            <HStack gap="s" alignItems="flex-start">
              <Icon
                as={LuCircleAlert}
                boxSize="16px"
                color="sentiment.negativeDefault"
                flexShrink={0}
                mt="2px"
              />
              <BodyMedium color="content.secondary">
                {t("error-detail")}
              </BodyMedium>
            </HStack>
            <HStack gap="s" flexWrap="wrap">
              <MeedButton
                variant="filled"
                minW="auto"
                px="l"
                onClick={retryRanking}
              >
                {t("error-retry")}
              </MeedButton>
              <MeedButton
                variant="text"
                minW="auto"
                px="m"
                onClick={() =>
                  router.push(
                    getMeedPath(lng, cityId, inventoryId, "preflight"),
                  )
                }
              >
                {t("error-back")}
              </MeedButton>
            </HStack>
          </VStack>
        ) : (
          <HStack
            gap="s"
            mx="m"
            mb="m"
            mt="m"
            bg="background.neutral"
            borderRadius="rounded"
            px="m"
            py="m"
          >
            <Icon
              as={LuCircleCheck}
              boxSize="16px"
              color="sentiment.positiveDefault"
              flexShrink={0}
            />
            <BodyMedium color="content.secondary">
              {t("footer-note")}
            </BodyMedium>
          </HStack>
        )}
      </Card.Root>

      {/* An unattended progress screen with no exit is a trap. */}
      {!done && !hasError && (
        <Box mt="l">
          <MeedButton
            variant="text"
            minW="auto"
            px="m"
            onClick={() =>
              router.push(getMeedPath(lng, cityId, inventoryId, "preflight"))
            }
          >
            {t("cancel")}
          </MeedButton>
        </Box>
      )}
    </Box>
  );
}
