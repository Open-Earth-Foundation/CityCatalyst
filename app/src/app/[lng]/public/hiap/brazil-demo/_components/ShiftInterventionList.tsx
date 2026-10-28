"use client";
import React, { useState } from "react";
import { Box, Card, Collapsible, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import { MeedScoreComposition } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedScoreComposition";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { MeedScoreWeights } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/rankingFacts";
import type { MitigationShift } from "../_lib/types";
import { pick } from "../_lib/localized";

const BAND_TONE: Record<MitigationShift["reductionBand"], MeedTone> = {
  very_low: "neutral",
  low: "neutral",
  medium: "warning",
  high: "positive",
  very_high: "positive",
};

/**
 * The two-level Brazil mitigation pattern: shifts ranked on Impact and
 * Alignment, expand one to see its interventions ranked within it. New for
 * Brazil — MEED has a flat list — and the one mitigation element shown ahead
 * of the Oct 21 review, so the tab is labelled provisional.
 */
export function ShiftInterventionList({
  shifts,
  ranked,
  weights,
  t,
  tResults,
  lng,
  onOpen,
}: {
  shifts: MitigationShift[];
  ranked: MeedRankedActionResult[];
  weights: MeedScoreWeights;
  t: TFunction;
  tResults: TFunction;
  lng: string;
  onOpen: (action: MeedRankedActionResult) => void;
}) {
  const [open, setOpen] = useState<string | null>(shifts[0]?.id ?? null);
  const byId = new Map(ranked.map((r) => [r.action_id, r]));
  const ordered = [...shifts].sort(
    (a, b) => b.impact + b.alignment - (a.impact + a.alignment),
  );

  return (
    <VStack alignItems="stretch" gap="m">
      <VStack alignItems="stretch" gap="xs">
        <TitleMedium color="content.primary">
          {t("shifts-title", { count: ordered.length })}
        </TitleMedium>
        <BodyMedium color="content.secondary">
          {t("shifts-description")}
        </BodyMedium>
      </VStack>
      {ordered.map((shift, i) => {
        const isOpen = open === shift.id;
        const interventions = shift.interventions
          .map((iv) => byId.get(iv.id))
          .filter((r): r is MeedRankedActionResult => Boolean(r))
          .sort((a, b) => b.final_score - a.final_score);
        return (
          <Card.Root
            key={shift.id}
            borderColor={isOpen ? "content.link" : "border.overlay"}
          >
            <Collapsible.Root
              open={isOpen}
              onOpenChange={(d) => setOpen(d.open ? shift.id : null)}
            >
              <Collapsible.Trigger asChild>
                <Box
                  as="button"
                  w="full"
                  textAlign="start"
                  _focusVisible={FOCUS_RING}
                  borderRadius="rounded"
                >
                  <Card.Body>
                    <HStack
                      justifyContent="space-between"
                      gap="m"
                      alignItems="flex-start"
                    >
                      <HStack gap="m" alignItems="flex-start" flex="1" minW={0}>
                        <BodyMedium
                          color="content.link"
                          fontWeight="bold"
                          flexShrink={0}
                        >
                          #{i + 1}
                        </BodyMedium>
                        <VStack
                          alignItems="flex-start"
                          gap="xs"
                          minW={0}
                          flex="1"
                        >
                          <HStack gap="s" flexWrap="wrap">
                            <LabelLarge color="content.primary">
                              {pick(shift.name, lng)}
                            </LabelLarge>
                            <MeedStatusTag
                              tone={BAND_TONE[shift.reductionBand]}
                            >
                              {t(`band-${shift.reductionBand}`)}
                            </MeedStatusTag>
                          </HStack>
                          <BodyMedium color="content.secondary">
                            {pick(shift.description, lng)}
                          </BodyMedium>
                          <HStack gap="l" w="full" maxW="520px" flexWrap="wrap">
                            <Box flex="1" minW="160px">
                              <MeedMeter
                                value={shift.impact}
                                tone="info"
                                label={t("shift-impact")}
                                valueText={shift.impact.toFixed(2)}
                              />
                            </Box>
                            <Box flex="1" minW="160px">
                              <MeedMeter
                                value={shift.alignment}
                                tone="positive"
                                label={t("shift-alignment")}
                                valueText={shift.alignment.toFixed(2)}
                              />
                            </Box>
                          </HStack>
                        </VStack>
                      </HStack>
                      <HStack gap="xs" flexShrink={0} color="content.link">
                        <BodySmall color="content.link">
                          {t("shift-interventions-count", {
                            count: shift.interventions.length,
                          })}
                        </BodySmall>
                        <Icon
                          as={isOpen ? LuChevronUp : LuChevronDown}
                          boxSize="16px"
                        />
                      </HStack>
                    </HStack>
                  </Card.Body>
                </Box>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <Box
                  borderTopWidth="1px"
                  borderColor="border.overlay"
                  px="l"
                  py="m"
                  bg="background.neutral"
                >
                  <VStack alignItems="stretch" gap="s">
                    <BodySmall color="content.tertiary">
                      {t("shift-interventions-note")}
                    </BodySmall>
                    {interventions.map((iv, j) => (
                      <HStack
                        key={iv.action_id}
                        justifyContent="space-between"
                        gap="m"
                        py="m"
                        borderTopWidth={j === 0 ? 0 : "1px"}
                        borderColor="border.overlay"
                        flexWrap="wrap"
                      >
                        <VStack
                          alignItems="flex-start"
                          gap="xs"
                          flex="1"
                          minW="240px"
                        >
                          <BodyMedium
                            color="content.primary"
                            fontWeight="semibold"
                          >
                            {shift.interventions.find(
                              (x) => x.id === iv.action_id,
                            )
                              ? pick(
                                  shift.interventions.find(
                                    (x) => x.id === iv.action_id,
                                  )!.name,
                                  lng,
                                )
                              : iv.action_id}
                          </BodyMedium>
                          <Box w="full" maxW="320px">
                            <MeedScoreComposition
                              action={iv}
                              weights={weights}
                              variant="compact"
                              t={tResults}
                            />
                          </Box>
                        </VStack>
                        <MeedButton
                          variant="outlined"
                          minW="auto"
                          px="m"
                          onClick={() => onOpen(iv)}
                        >
                          {tResults("view-details")}
                        </MeedButton>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              </Collapsible.Content>
            </Collapsible.Root>
          </Card.Root>
        );
      })}
    </VStack>
  );
}
