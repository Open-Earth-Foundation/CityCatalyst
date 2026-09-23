"use client";
import React from "react";
import { HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuPencil } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import type { DemoPreferences } from "../_lib/types";

function Preview({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <VStack
      alignItems="stretch"
      gap="xs"
      p="m"
      borderRadius="rounded"
      bg="background.neutral"
      minW={0}
    >
      <Overline color="content.tertiary">{label}</Overline>
      <TitleMedium color="content.primary" fontVariantNumeric="tabular-nums">
        {value}
      </TitleMedium>
      <BodySmall color="content.secondary" lineClamp={1} title={detail}>
        {detail}
      </BodySmall>
    </VStack>
  );
}

/**
 * A reminder of the settings the ranking ran with — one small box per
 * parameter with a count and a one-line preview, and one button to change
 * any of it. Not a place to read the preferences in full; that is the
 * preferences screen.
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
  const box = (label: string, items: string[]) => ({
    label,
    value: String(items.length),
    detail: items.length ? items.join(", ") : none,
  });
  const boxes = [
    box(t("config-sectors"), preferences.sectors.map(labelFor.sector)),
    box(t("config-cobenefits"), preferences.coBenefits.map(labelFor.coBenefit)),
    box(
      t("config-priority-risks"),
      preferences.priorityRisks.map(labelFor.risk),
    ),
    box(t("config-timeline"), preferences.timeline.map(labelFor.timeline)),
    box(
      t("config-exclusions"),
      preferences.excludedActionIds.map(labelFor.action),
    ),
    {
      label: t("config-weights"),
      value: `${w.impact} · ${w.alignment} · ${w.feasibility}`,
      detail: t("config-weights-preview"),
    },
  ];

  return (
    <VStack alignItems="stretch" gap="m">
      <HStack
        justifyContent="space-between"
        alignItems="center"
        gap="m"
        flexWrap="wrap"
      >
        <LabelLarge color="content.primary">{t("config-title")}</LabelLarge>
        <MeedButton
          asChild
          variant="outlined"
          minW="auto"
          px="m"
          leftIcon={<Icon as={LuPencil} boxSize="14px" />}
        >
          <NextLink href={editHref}>{t("config-edit")}</NextLink>
        </MeedButton>
      </HStack>
      <SimpleGrid columns={{ base: 2, md: 3, lg: 6 }} gap="m">
        {boxes.map((b) => (
          <Preview key={b.label} {...b} />
        ))}
      </SimpleGrid>
    </VStack>
  );
}
