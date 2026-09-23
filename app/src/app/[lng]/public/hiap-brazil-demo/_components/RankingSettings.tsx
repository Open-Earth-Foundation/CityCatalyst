"use client";
import React, { useState } from "react";
import {
  Box,
  Card,
  Collapsible,
  Grid,
  HStack,
  Icon,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { LuChevronDown, LuChevronUp, LuPencil } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { DemoPreferences, DemoTrack } from "../_lib/types";
import { DEFAULT_WEIGHTS } from "../_lib/state";

/**
 * What the ranking ran with, in one line — and, on request, in full. The
 * collapsed row is a reminder; the expanded panel is the pre-flight summary
 * with nothing truncated, so long exclusion names read whole. Changing any
 * of it happens on the preferences screen.
 */
export function RankingSettings({
  preferences,
  track,
  editHref,
  labelFor,
  t,
  tResults,
}: {
  preferences: DemoPreferences;
  track: DemoTrack;
  editHref: string;
  labelFor: {
    sector: (k: string) => string;
    coBenefit: (k: string) => string;
    timeline: (k: string) => string;
    risk: (k: string) => string;
    action: (id: string) => string;
  };
  /** Demo namespace. */
  t: TFunction;
  /** `meed-results` namespace, for the pillar names. */
  tResults: TFunction;
}) {
  const [open, setOpen] = useState(false);
  const w = preferences.weights;
  const isCustom = (["impact", "alignment", "feasibility"] as const).some(
    (k) => w[k] !== DEFAULT_WEIGHTS[k],
  );

  const groups = [
    {
      label: t("pref-row-sectors"),
      items: preferences.sectors.map(labelFor.sector),
      count: "pref-sum-sectors",
    },
    {
      label: t("pref-row-cobenefits"),
      items: preferences.coBenefits.map(labelFor.coBenefit),
      count: "pref-sum-cobenefits",
    },
    ...(track === "adaptation"
      ? [
          {
            label: t("pref-row-risks"),
            items: preferences.priorityRisks.map(labelFor.risk),
            count: "pref-sum-risks",
          },
        ]
      : []),
    {
      label: t("pref-row-timeline"),
      items: preferences.timeline.map(labelFor.timeline),
      count: "pref-sum-timeline",
    },
    {
      label: t("pref-row-exclusions"),
      items: preferences.excludedActionIds.map(labelFor.action),
      count: "pref-sum-exclusions",
    },
  ];
  const summaryParts = groups
    .filter((g) => g.items.length > 0)
    .map((g) => t(g.count, { count: g.items.length }));
  summaryParts.push(
    isCustom ? t("settings-weights-custom") : t("settings-weights-default"),
  );
  const pillars = [
    { key: "impact", label: tResults("composition-impact"), value: w.impact },
    {
      key: "alignment",
      label: tResults("composition-alignment"),
      value: w.alignment,
    },
    {
      key: "feasibility",
      label: tResults("composition-feasibility"),
      value: w.feasibility,
    },
  ];

  return (
    <Card.Root borderColor="border.overlay">
      <Collapsible.Root open={open} onOpenChange={(d) => setOpen(d.open)}>
        <Card.Body p="l">
          <HStack
            justifyContent="space-between"
            alignItems="center"
            gap="m"
            flexWrap="wrap"
          >
            <VStack alignItems="flex-start" gap="xs" flex="1" minW="240px">
              <LabelLarge color="content.primary">
                {t("settings-title")}
              </LabelLarge>
              <BodyMedium color="content.secondary">
                {summaryParts.length > 1
                  ? summaryParts.join(" · ")
                  : t("settings-none")}
              </BodyMedium>
            </VStack>
            <HStack gap="s" flexWrap="wrap">
              <Collapsible.Trigger asChild>
                <MeedButton
                  variant="text"
                  minW="auto"
                  px="s"
                  rightIcon={
                    <Icon
                      as={open ? LuChevronUp : LuChevronDown}
                      boxSize="14px"
                    />
                  }
                  _focusVisible={FOCUS_RING}
                >
                  {open ? t("settings-hide") : t("settings-show")}
                </MeedButton>
              </Collapsible.Trigger>
              <MeedButton
                asChild
                variant="outlined"
                minW="auto"
                px="m"
                leftIcon={<Icon as={LuPencil} boxSize="14px" />}
              >
                <NextLink href={editHref}>{t("settings-edit")}</NextLink>
              </MeedButton>
            </HStack>
          </HStack>
        </Card.Body>
        <Collapsible.Content>
          <Box
            px="l"
            pb="l"
            pt="l"
            borderTopWidth="1px"
            borderColor="border.overlay"
          >
            <Grid
              templateColumns={{ base: "1fr", md: "max-content 1fr" }}
              columnGap="xl"
              rowGap="m"
              alignItems="start"
            >
              {groups.map((g) => (
                <React.Fragment key={g.label}>
                  <BodyMedium color="content.tertiary">{g.label}</BodyMedium>
                  <BodyMedium color="content.primary">
                    {g.items.length ? g.items.join(" · ") : t("config-none")}
                  </BodyMedium>
                </React.Fragment>
              ))}
              <BodyMedium color="content.tertiary">
                {t("pref-row-weights")}
              </BodyMedium>
              <SimpleGrid columns={{ base: 1, sm: 3 }} gap="m">
                {pillars.map((p) => (
                  <MeedMeter
                    key={p.key}
                    value={p.value / 100}
                    tone="info"
                    label={p.label}
                    valueText={`${p.value}%`}
                  />
                ))}
              </SimpleGrid>
            </Grid>
          </Box>
        </Collapsible.Content>
      </Collapsible.Root>
    </Card.Root>
  );
}
