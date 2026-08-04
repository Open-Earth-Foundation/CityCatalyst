"use client";
import React, { useEffect, useRef, useState } from "react";
import { Box, Card, HStack, Icon, Spinner, VStack } from "@chakra-ui/react";
import { LuCircleCheck } from "react-icons/lu";
import { useRouter } from "next/navigation";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { getMeedPath } from "../../steps";

/** Total scripted animation time before navigating to the results screen. */
const ANIMATION_MS = 8000;
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
      gap="12px"
      px="24px"
      py="14px"
      borderTopWidth="1px"
      borderColor="border.overlay"
    >
      <Box flexShrink={0} mt="2px">
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
      <VStack alignItems="stretch" gap="3px" flex="1" minW="0">
        <HStack justifyContent="space-between">
          <LabelMedium
            color={status === "pending" ? "content.tertiary" : "content.primary"}
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
          color={status === "pending" ? "content.tertiary" : "content.secondary"}
        >
          {t(`stage-${stageId}-desc`)}
        </BodySmall>
        {status === "running" && (
          <Box
            mt="6px"
            h="4px"
            bg="background.neutral"
            borderRadius="3px"
            overflow="hidden"
          >
            <Box
              h="full"
              w={`${pct}%`}
              bg="content.link"
              borderRadius="3px"
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
  const startTime = useRef(Date.now());

  // Scripted progress animation: 0 → 100 over ~8 seconds with ease-in-out.
  // TODO(meed backend): once the prioritization call is wired in, gate the
  // completion (and the navigation below) on the real request finishing, as
  // the prototype did.
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      const raw = elapsed / ANIMATION_MS;
      const eased = Math.min(
        raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw,
        0.99,
      );
      setOverall(Math.round(eased * 100));
      if (elapsed >= ANIMATION_MS) {
        clearInterval(interval);
        setOverall(100);
        setDone(true);
      }
    }, 60);
    return () => clearInterval(interval);
  }, []);

  // Navigate to the results screen shortly after the animation completes.
  useEffect(() => {
    if (!done) return;
    const timeout = setTimeout(
      () =>
        router.push(`/${lng}/cities/${cityId}/MEED/${inventoryId}/results`),
      NAVIGATE_DELAY_MS,
    );
    return () => clearTimeout(timeout);
  }, [done, router, lng, cityId, inventoryId]);

  const displayPct = done ? 100 : overall;

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      flexDirection="column"
      alignItems="center"
      py="48px"
      px="24px"
    >
      <Card.Root maxW="620px" w="full" overflow="hidden">
        {/* Header */}
        <HStack
          gap="14px"
          px="24px"
          py="18px"
          bg="background.neutral"
          borderBottomWidth="1px"
          borderColor="border.overlay"
        >
          {done ? (
            <Icon
              as={LuCircleCheck}
              boxSize="36px"
              color="sentiment.positiveDefault"
            />
          ) : (
            <Spinner size="lg" color="content.link" />
          )}
          <VStack alignItems="flex-start" gap="2px">
            <TitleMedium
              color={done ? "sentiment.positiveDefault" : "content.primary"}
            >
              {done ? t("header-done") : t("header-running")}
            </TitleMedium>
            <BodySmall color="content.secondary">{t("header-sub")}</BodySmall>
          </VStack>
        </HStack>

        {/* Overall progress */}
        <Box px="24px" pt="16px">
          <Box h="6px" bg="background.neutral" borderRadius="4px" overflow="hidden">
            <Box
              h="full"
              w={`${displayPct}%`}
              bg={done ? "sentiment.positiveDefault" : "content.link"}
              borderRadius="4px"
              transition="width 0.2s ease, background 0.4s ease"
            />
          </Box>
          <BodySmall
            color="content.secondary"
            mt="6px"
            mb="4px"
            aria-live="polite"
          >
            {t("percent-complete", { pct: displayPct })}
            {" — "}
            {done
              ? t("all-complete")
              : t("stage-in-progress", { stage: t(currentStageKey(displayPct)) })}
          </BodySmall>
        </Box>

        {/* Stage rows */}
        <Box pt="4px">
          {STAGES.map((stageId, i) => (
            <StageRow
              key={stageId}
              stageId={stageId}
              status={done ? "complete" : stageStatus(i, displayPct)}
              pct={done ? 100 : stageProgress(i, displayPct)}
              t={t}
            />
          ))}
        </Box>

        {/* Footer */}
        <HStack
          gap="10px"
          mx="16px"
          mb="16px"
          mt="12px"
          bg="background.neutral"
          borderRadius="8px"
          px="16px"
          py="12px"
        >
          <Icon
            as={LuCircleCheck}
            boxSize="16px"
            color="sentiment.positiveDefault"
            flexShrink={0}
          />
          <BodyMedium color="content.secondary">{t("footer-note")}</BodyMedium>
        </HStack>
      </Card.Root>

      {/* An unattended progress screen with no exit is a trap. */}
      {!done && (
        <Box mt="20px">
          <CCTerraButton
            variant="text"
            minW="auto"
            px="16px"
            onClick={() =>
              router.push(
                getMeedPath(lng, cityId, inventoryId, "preflight"),
              )
            }
          >
            {t("cancel")}
          </CCTerraButton>
        </Box>
      )}
    </Box>
  );
}
