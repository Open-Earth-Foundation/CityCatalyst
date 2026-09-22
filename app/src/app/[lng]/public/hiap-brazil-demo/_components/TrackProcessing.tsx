"use client";
import React, { useEffect, useRef, useState } from "react";
import { Box, Card, HStack, Icon, Spinner, VStack } from "@chakra-ui/react";
import { LuCircleCheck } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import type { DemoTrack } from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { SCREEN_IDS, trackHref } from "../_lib/hrefs";
import { ScreenTag } from "./ScreenTag";

const STAGES = ["validation", "impact", "alignment", "feasibility"] as const;
const BOUNDARIES = [0, 15, 60, 82, 100];
const DURATION_MS = 4500;

/**
 * BR-A4b / BR-M4b — the processing screen, animation only. Same four stages
 * as the module's; the demo has nothing to wait for, so it parks briefly on
 * each and then marks the ranking as generated. Most Brazilian cities will see
 * a precomputed ranking first (Compass), which is why this screen is short.
 */
export function TrackProcessing({
  lng,
  citySlug,
  track,
}: {
  lng: string;
  citySlug: string;
  track: DemoTrack;
}) {
  const { city, markGenerated } = useTrack(lng, citySlug, track);
  const { t } = useDemoT(lng);
  const tProc = useTrackT(lng, track, "meed-processing");
  const router = useRouter();
  const [pct, setPct] = useState(0);
  const started = useRef<number | null>(null);
  const done = pct >= 100;
  const screenId =
    track === "adaptation"
      ? SCREEN_IDS.adaptation.processing
      : SCREEN_IDS.mitigation.processing;

  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      started.current ??= now;
      const next = Math.min(
        100,
        Math.round(((now - started.current) / DURATION_MS) * 100),
      );
      setPct(next);
      if (next < 100) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!done) return;
    markGenerated();
    const timer = window.setTimeout(
      () => router.replace(trackHref(lng, city.slug, track)),
      900,
    );
    return () => window.clearTimeout(timer);
  }, [done, markGenerated, router, lng, city.slug, track]);

  return (
    <Box
      h="full"
      bg="background.backgroundLight"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px="l"
      py="xxl"
    >
      <Card.Root maxW="620px" w="full" overflow="hidden">
        <Card.Body>
          <VStack alignItems="stretch" gap="l">
            <HStack
              justifyContent="space-between"
              alignItems="flex-start"
              gap="m"
            >
              <HStack gap="m" alignItems="flex-start">
                {done ? (
                  <Icon
                    as={LuCircleCheck}
                    boxSize="24px"
                    color="interactive.tertiary"
                  />
                ) : (
                  <Spinner size="md" color="content.link" />
                )}
                <VStack alignItems="flex-start" gap="xs">
                  <TitleMedium color="content.primary">
                    {done ? tProc("header-done") : tProc("header-running")}
                  </TitleMedium>
                  <BodySmall color="content.secondary">
                    {t("processing-demo-note")}
                  </BodySmall>
                </VStack>
              </HStack>
              <ScreenTag id={screenId} title={t("screen-tag-title")} />
            </HStack>
            <Box>
              <Box
                h="6px"
                w="full"
                bg="background.neutral"
                borderRadius="pill"
                overflow="hidden"
              >
                <Box
                  h="full"
                  w={`${pct}%`}
                  bg="content.link"
                  transition="width 0.2s linear"
                />
              </Box>
              <BodySmall color="content.tertiary" mt="xs">
                {tProc("percent-complete", { pct })}
              </BodySmall>
            </Box>
            <VStack alignItems="stretch" gap="s">
              {STAGES.map((stage, i) => {
                const status =
                  pct >= BOUNDARIES[i + 1]
                    ? "complete"
                    : pct >= BOUNDARIES[i]
                      ? "running"
                      : "pending";
                return (
                  <HStack key={stage} gap="m" alignItems="flex-start">
                    <Box mt="xs" flexShrink={0}>
                      {status === "complete" ? (
                        <Icon
                          as={LuCircleCheck}
                          boxSize="16px"
                          color="interactive.tertiary"
                        />
                      ) : status === "running" ? (
                        <Spinner size="xs" color="content.link" />
                      ) : (
                        <Box
                          boxSize="16px"
                          borderRadius="full"
                          borderWidth="1px"
                          borderColor="border.neutral"
                        />
                      )}
                    </Box>
                    <VStack alignItems="flex-start" gap="0" flex="1">
                      <HStack gap="s">
                        <LabelMedium
                          color={
                            status === "pending"
                              ? "content.tertiary"
                              : "content.primary"
                          }
                        >
                          {tProc(`stage-${stage}`)}
                        </LabelMedium>
                        {status === "running" && (
                          <MeedStatusTag tone="info">
                            {tProc("stage-in-progress", { stage: "" }).trim()}
                          </MeedStatusTag>
                        )}
                      </HStack>
                      <BodySmall color="content.tertiary">
                        {t(`stage-${stage}-desc-${track}`)}
                      </BodySmall>
                    </VStack>
                  </HStack>
                );
              })}
            </VStack>
            <HStack justifyContent="space-between">
              <BodyMedium color="content.secondary">
                {done ? tProc("all-complete") : tProc("footer-note")}
              </BodyMedium>
              {!done && (
                <MeedButton
                  variant="outlined"
                  minW="auto"
                  px="m"
                  onClick={() =>
                    router.push(trackHref(lng, city.slug, track, "preflight"))
                  }
                >
                  {tProc("cancel")}
                </MeedButton>
              )}
            </HStack>
          </VStack>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}
