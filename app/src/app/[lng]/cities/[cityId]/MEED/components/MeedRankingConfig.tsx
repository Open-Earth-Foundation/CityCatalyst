"use client";
import React, { useEffect, useState } from "react";
import { Grid, GridItem, HStack, Icon, Link, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuPencil, LuTriangleAlert } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import {
  getMeedConfirmedExclusions,
  getMeedPreferences,
  MEED_STATE_CHANGED_EVENT,
  type MeedStrategicPreferences,
} from "../meedLocalState";
import type { MeedScoreWeights } from "../[inventory]/results/components/rankingFacts";
import { MeedStatusTag } from "./MeedStatusTag";
import { FOCUS_RING } from "../focusRing";

/** API option keys use snake_case; locale keys are kebab-case. */
const kebab = (key: string) => key.replace(/_/g, "-");

export interface MeedRankingConfigProps {
  inventoryId: string;
  /** The weights the ranking was actually scored with (from its metadata). */
  weights: MeedScoreWeights;
  /** True when the stored preferences no longer match the ranking. */
  isStale: boolean;
  /** Where "Edit preferences" leads (the preferences step, with a return target). */
  editHref: string;
  lng: string;
}

/**
 * The configuration behind the ranking — priority sectors, co-benefits,
 * timeline, exclusions and pillar weights — so the user can check how they
 * set the model up before deciding whether to change it and re-run.
 *
 * Preferences live in localStorage per inventory; they are read in an effect
 * (not during render) so the server and the first client render agree. When
 * they have moved on since the ranking was generated, the row says so instead
 * of presenting today's settings as the ones that produced the result.
 */
export function MeedRankingConfig({
  inventoryId,
  weights,
  isStale,
  editHref,
  lng,
}: MeedRankingConfigProps) {
  const { t } = useTranslation(lng, "meed-preferences");
  const { t: tResults } = useTranslation(lng, "meed-results");
  const [prefs, setPrefs] = useState<MeedStrategicPreferences | null>(null);
  const [exclusions, setExclusions] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => {
      setPrefs(getMeedPreferences(inventoryId));
      setExclusions(getMeedConfirmedExclusions(inventoryId));
    };
    refresh();
    window.addEventListener(MEED_STATE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MEED_STATE_CHANGED_EVENT, refresh);
  }, [inventoryId]);

  const chips = (keys: string[], prefix: string) =>
    keys.length ? (
      <HStack gap="xs" flexWrap="wrap">
        {keys.map((key) => (
          <MeedStatusTag key={key} tone="neutral">
            {t(`${prefix}-${kebab(key)}`)}
          </MeedStatusTag>
        ))}
      </HStack>
    ) : (
      <BodyMedium color="content.tertiary">
        {tResults("config-none")}
      </BodyMedium>
    );

  const timeline = prefs?.timeline?.length
    ? prefs.timeline.map((key) => t(`timeline-${kebab(key)}`)).join(", ")
    : tResults("config-none");

  const exclusionParts = [
    exclusions.length
      ? tResults("config-exclusions-actions", { count: exclusions.length })
      : null,
    prefs?.excludedSectors?.length
      ? tResults("config-exclusions-sectors", {
          list: prefs.excludedSectors
            .map((key) => t(`sector-${kebab(key)}`))
            .join(", "),
        })
      : null,
    prefs?.excludedCoBenefits?.length
      ? tResults("config-exclusions-cobenefits", {
          list: prefs.excludedCoBenefits
            .map((key) => t(`co-benefit-${kebab(key)}`))
            .join(", "),
        })
      : null,
  ].filter(Boolean);

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: tResults("config-sectors"),
      value: chips(prefs?.sectors ?? [], "sector"),
    },
    {
      label: tResults("config-cobenefits"),
      value: chips(prefs?.strategicPriorities ?? [], "co-benefit"),
    },
    {
      label: tResults("config-timeline"),
      value: <BodyMedium color="content.primary">{timeline}</BodyMedium>,
    },
    {
      label: tResults("config-exclusions"),
      value: (
        <BodyMedium color="content.primary">
          {exclusionParts.length
            ? exclusionParts.join(" · ")
            : tResults("config-none")}
        </BodyMedium>
      ),
    },
    {
      label: tResults("config-weights"),
      value: (
        <BodyMedium color="content.primary" fontVariantNumeric="tabular-nums">
          {tResults("config-weights-value", {
            impact: Math.round(weights.impact * 100),
            alignment: Math.round(weights.alignment * 100),
            feasibility: Math.round(weights.feasibility * 100),
          })}
        </BodyMedium>
      ),
    },
  ];

  return (
    <VStack alignItems="stretch" gap="s">
      <HStack
        justifyContent="space-between"
        alignItems="center"
        gap="m"
        flexWrap="wrap"
      >
        <HStack gap="s" alignItems="center">
          <Overline color="content.tertiary">
            {tResults("config-title")}
          </Overline>
          {isStale && (
            <MeedStatusTag tone="warning">
              <HStack gap="xs" alignItems="center">
                <Icon as={LuTriangleAlert} boxSize="12px" />
                <span>{tResults("config-stale")}</span>
              </HStack>
            </MeedStatusTag>
          )}
        </HStack>
        <Link
          asChild
          color="content.link"
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          _focusVisible={FOCUS_RING}
        >
          <NextLink href={editHref}>
            <HStack gap="xs" alignItems="center">
              <Icon as={LuPencil} boxSize="14px" />
              <span>{tResults("config-edit")}</span>
            </HStack>
          </NextLink>
        </Link>
      </HStack>
      <Grid
        templateColumns={{ base: "1fr", md: "max-content 1fr" }}
        columnGap="l"
        rowGap="s"
        alignItems="start"
      >
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <GridItem>
              <BodyMedium color="content.tertiary">{row.label}</BodyMedium>
            </GridItem>
            <GridItem>{row.value}</GridItem>
          </React.Fragment>
        ))}
      </Grid>
    </VStack>
  );
}
