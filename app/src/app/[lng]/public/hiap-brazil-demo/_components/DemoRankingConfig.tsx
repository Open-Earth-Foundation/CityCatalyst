"use client";
import React from "react";
import { Grid, HStack, Icon, Link, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuPencil } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { DemoPreferences } from "../_lib/types";

function ChipRow({ items, none }: { items: string[]; none: string }) {
  if (items.length === 0)
    return <BodyMedium color="content.tertiary">{none}</BodyMedium>;
  return (
    <HStack gap="xs" flexWrap="wrap">
      {items.map((item) => (
        <MeedStatusTag key={item} tone="neutral">
          {item}
        </MeedStatusTag>
      ))}
    </HStack>
  );
}

/**
 * The configuration behind the ranking — the demo's counterpart to
 * `MeedRankingConfig`: one labelled row per preference group, chips for the
 * choices, read-only meters for the weights, and one way to change any of it.
 */
export function DemoRankingConfig({
  preferences,
  editHref,
  labelFor,
  t,
}: {
  preferences: DemoPreferences;
  editHref: string;
  labelFor: {
    sector: (k: string) => string;
    coBenefit: (k: string) => string;
    timeline: (k: string) => string;
    risk: (k: string) => string;
    action: (id: string) => string;
  };
  /** `meed-results` namespace (with the demo's track overrides). */
  t: TFunction;
}) {
  const none = t("config-none");
  const w = preferences.weights;
  const rows: { label: string; items: string[] }[] = [
    {
      label: t("config-sectors"),
      items: preferences.sectors.map(labelFor.sector),
    },
    {
      label: t("config-cobenefits"),
      items: preferences.coBenefits.map(labelFor.coBenefit),
    },
    {
      label: t("config-priority-risks"),
      items: preferences.priorityRisks.map(labelFor.risk),
    },
    {
      label: t("config-timeline"),
      items: preferences.timeline.map(labelFor.timeline),
    },
    {
      label: t("config-exclusions"),
      items: preferences.excludedActionIds.map(labelFor.action),
    },
  ];
  const pillars = [
    { key: "impact", label: t("composition-impact"), value: w.impact },
    { key: "alignment", label: t("composition-alignment"), value: w.alignment },
    {
      key: "feasibility",
      label: t("composition-feasibility"),
      value: w.feasibility,
    },
  ];

  return (
    <VStack alignItems="stretch" gap="m">
      <HStack justifyContent="space-between" alignItems="center" gap="m">
        <LabelLarge color="content.primary">{t("config-title")}</LabelLarge>
        <Link
          asChild
          color="content.link"
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          _focusVisible={FOCUS_RING}
        >
          <NextLink href={editHref}>
            <HStack gap="xs">
              <Icon as={LuPencil} boxSize="14px" />
              <span>{t("config-edit")}</span>
            </HStack>
          </NextLink>
        </Link>
      </HStack>
      <Grid
        templateColumns={{ base: "1fr", md: "max-content 1fr" }}
        columnGap="l"
        rowGap="m"
        alignItems="start"
      >
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <BodyMedium color="content.tertiary" pt="2px">
              {row.label}
            </BodyMedium>
            <ChipRow items={row.items} none={none} />
          </React.Fragment>
        ))}
        <BodyMedium color="content.tertiary" pt="2px">
          {t("config-weights")}
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
    </VStack>
  );
}
