"use client";
import React from "react";
import { HStack, Icon, Link, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuPencil } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { DemoPreferences } from "../_lib/types";

/**
 * The configuration behind the ranking — the demo's counterpart to
 * `MeedRankingConfig`, which reads the real module's localStorage keys.
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
  };
  t: TFunction;
}) {
  const none = t("config-none");
  const list = (items: string[]) => (items.length ? items.join(", ") : none);
  const w = preferences.weights;
  return (
    <VStack alignItems="stretch" gap="s">
      <HStack justifyContent="space-between" alignItems="center">
        <LabelMedium color="content.primary">{t("config-title")}</LabelMedium>
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
      <SimpleGrid columns={{ base: 1, md: 3 }} gap="m">
        <VStack alignItems="flex-start" gap="xs">
          <Caption color="content.tertiary">{t("config-sectors")}</Caption>
          <BodyMedium color="content.secondary">
            {list(preferences.sectors.map(labelFor.sector))}
          </BodyMedium>
        </VStack>
        <VStack alignItems="flex-start" gap="xs">
          <Caption color="content.tertiary">{t("config-cobenefits")}</Caption>
          <BodyMedium color="content.secondary">
            {list(preferences.coBenefits.map(labelFor.coBenefit))}
          </BodyMedium>
        </VStack>
        <VStack alignItems="flex-start" gap="xs">
          <Caption color="content.tertiary">{t("config-timeline")}</Caption>
          <BodyMedium color="content.secondary">
            {list(preferences.timeline.map(labelFor.timeline))}
          </BodyMedium>
        </VStack>
        <VStack alignItems="flex-start" gap="xs">
          <Caption color="content.tertiary">
            {t("config-priority-risks")}
          </Caption>
          <BodyMedium color="content.secondary">
            {list(preferences.priorityRisks.map(labelFor.risk))}
          </BodyMedium>
        </VStack>
        <VStack alignItems="flex-start" gap="xs">
          <Caption color="content.tertiary">{t("config-exclusions")}</Caption>
          <BodyMedium color="content.secondary">
            {preferences.excludedActionIds.length
              ? t("config-exclusions-count", {
                  count: preferences.excludedActionIds.length,
                })
              : none}
          </BodyMedium>
        </VStack>
        <VStack alignItems="flex-start" gap="xs">
          <Caption color="content.tertiary">{t("config-weights")}</Caption>
          <BodyMedium color="content.secondary">
            {t("config-weights-value", {
              impact: w.impact,
              alignment: w.alignment,
              feasibility: w.feasibility,
            })}
          </BodyMedium>
        </VStack>
      </SimpleGrid>
    </VStack>
  );
}
