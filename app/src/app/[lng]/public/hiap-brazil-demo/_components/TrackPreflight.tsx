"use client";
import React from "react";
import { Card, HStack, Icon, Link, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuZap } from "react-icons/lu";
import type { TFunction } from "i18next";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { Slider } from "@/components/ui/slider";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { useRouter } from "next/navigation";
import type { DemoTrack, DemoWeights } from "../_lib/types";
import { useTrack } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { useLabels } from "../_lib/useLabels";
import { SCREEN_IDS, trackHref } from "../_lib/hrefs";
import { DEFAULT_WEIGHTS } from "../_lib/state";
import { RISK_CELLS } from "../_lib/riskCells";
import { DemoShell } from "./DemoShell";

const WEIGHT_KEYS: (keyof DemoWeights)[] = [
  "impact",
  "alignment",
  "feasibility",
];

/** Moving one slider redistributes the remainder proportionally across the other two. */
function rebalance(
  weights: DemoWeights,
  key: keyof DemoWeights,
  value: number,
): DemoWeights {
  const others = WEIGHT_KEYS.filter((k) => k !== key);
  const rest = others.reduce((s, k) => s + weights[k], 0) || 1;
  const remaining = 100 - value;
  const next = { ...weights, [key]: value };
  next[others[0]] = Math.round((weights[others[0]] / rest) * remaining);
  next[others[1]] = remaining - next[others[0]];
  return next;
}

function WeightSlider({
  label,
  description,
  value,
  defaultValue,
  onChange,
  t,
}: {
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  onChange: (v: number) => void;
  t: TFunction;
}) {
  const isDefault = value === defaultValue;
  return (
    <VStack alignItems="stretch" gap="s">
      <HStack justifyContent="space-between" alignItems="center" gap="s">
        <VStack alignItems="flex-start" gap="0" minW="0" flex="1">
          <LabelLarge color="content.primary">{label}</LabelLarge>
          <BodySmall color="content.tertiary">{description}</BodySmall>
        </VStack>
        <TitleMedium
          color={isDefault ? "content.secondary" : "content.link"}
          flexShrink={0}
          fontVariantNumeric="tabular-nums"
        >
          {value}%
        </TitleMedium>
      </HStack>
      <Slider
        value={[value]}
        min={5}
        max={90}
        step={1}
        marks={[defaultValue]}
        aria-label={[label]}
        getAriaValueText={(d: { value: number }) =>
          t("weight-value-text", { value: d.value })
        }
        onValueChange={(d: { value: number[] }) => onChange(d.value[0])}
        _focusWithin={FOCUS_RING}
      />
      <HStack justifyContent="space-between" gap="s">
        <Caption color="content.tertiary">5%</Caption>
        <Caption color="content.tertiary" textAlign="center">
          {isDefault
            ? t("weight-default", { value: defaultValue })
            : t("weight-adjusted", { value: defaultValue })}
        </Caption>
        <Caption color="content.tertiary">90%</Caption>
      </HStack>
    </VStack>
  );
}

type InputStatus = "complete" | "optional" | "custom";

const STATUS_TONE: Record<InputStatus, MeedTone> = {
  complete: "positive",
  optional: "neutral",
  custom: "warning",
};

/**
 * One input the ranking reads: what it is, whether it is required, whether
 * it is set, and where to change it. Nothing here is a gate — the point of
 * the row is to say so.
 */
function Row({
  label,
  requirement,
  status,
  statusLabel,
  sub,
  href,
  linkLabel,
  isLast,
}: {
  label: string;
  requirement: string;
  status: InputStatus;
  statusLabel: string;
  sub: string;
  href?: string;
  linkLabel?: string;
  isLast?: boolean;
}) {
  return (
    <HStack
      justifyContent="space-between"
      alignItems="center"
      gap="m"
      py="m"
      borderBottomWidth={isLast ? 0 : "1px"}
      borderColor="border.overlay"
    >
      <VStack alignItems="flex-start" gap="xs" flex="1" minW="0">
        <HStack gap="s" flexWrap="wrap" alignItems="center">
          <LabelLarge color="content.primary">{label}</LabelLarge>
          <MeedStatusTag tone="info">{requirement}</MeedStatusTag>
          <MeedStatusTag tone={STATUS_TONE[status]}>
            {statusLabel}
          </MeedStatusTag>
        </HStack>
        <BodySmall color="content.tertiary">{sub}</BodySmall>
      </VStack>
      {href && linkLabel && (
        <Link
          asChild
          flexShrink={0}
          color="content.link"
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          _focusVisible={FOCUS_RING}
        >
          <NextLink href={href}>{linkLabel}</NextLink>
        </Link>
      )}
    </HStack>
  );
}

/** BR-A4 / BR-M4 — pre-flight check. */
export function TrackPreflight({
  lng,
  citySlug,
  track,
}: {
  lng: string;
  citySlug: string;
  track: DemoTrack;
}) {
  const { city, state, setPreferences, markVisited, isReady } = useTrack(
    lng,
    citySlug,
    track,
  );
  const { t } = useDemoT(lng);
  const tPre = useTrackT(lng, track, "meed-preflight");
  const labels = useLabels(lng, track);
  const router = useRouter();
  const prefs = state.preferences;
  const screenId =
    track === "adaptation"
      ? SCREEN_IDS.adaptation.preflight
      : SCREEN_IDS.mitigation.preflight;

  React.useEffect(() => {
    if (isReady && !state.visited.preflight) markVisited("preflight");
  }, [isReady, state.visited.preflight, markVisited]);

  const weights = prefs.weights;
  const total = weights.impact + weights.alignment + weights.feasibility;
  const isCustom = WEIGHT_KEYS.some((k) => weights[k] !== DEFAULT_WEIGHTS[k]);
  const cellsWithData = RISK_CELLS.filter((c) => city.risk[c.key]).length;
  const prefsHref = trackHref(lng, city.slug, track, "preferences");

  // Preferences are the city's choices, not model requirements: with none set
  // the city-priorities component falls back to the neutral 0.5 (§7).
  const hasPreferences =
    prefs.sectors.length +
      prefs.coBenefits.length +
      prefs.timeline.length +
      prefs.priorityRisks.length +
      prefs.excludedActionIds.length >
    0;

  const optionalRow = (label: string, items: string[]) => ({
    label,
    requirement: t("req-optional"),
    status: (items.length > 0 ? "complete" : "optional") as InputStatus,
    statusLabel:
      items.length > 0
        ? t("status-set", { count: items.length })
        : t("status-not-set"),
    sub: items.length > 0 ? items.join(" · ") : t("status-not-set-sub"),
    href: prefsHref,
    linkLabel: items.length > 0 ? tPre("edit-step") : tPre("enter-data"),
  });

  const rows = [
    {
      label: track === "adaptation" ? t("step-risk") : t("step-emissions"),
      requirement: t("req-required-data"),
      status: "complete" as InputStatus,
      statusLabel: t("status-complete"),
      sub:
        track === "adaptation"
          ? t("preflight-risk-sub", { count: cellsWithData })
          : t("preflight-emissions-sub", { year: city.inventory.year }),
      href: trackHref(
        lng,
        city.slug,
        track,
        track === "adaptation" ? "risk" : "emissions",
      ),
      linkLabel: tPre("view-breakdown"),
    },
    optionalRow(t("pref-row-sectors"), prefs.sectors.map(labels.sector)),
    optionalRow(
      t("pref-row-cobenefits"),
      prefs.coBenefits.map(labels.coBenefit),
    ),
    optionalRow(t("pref-row-timeline"), prefs.timeline.map(labels.timeline)),
    ...(track === "adaptation"
      ? [optionalRow(t("pref-row-risks"), prefs.priorityRisks.map(labels.cell))]
      : []),
    {
      ...optionalRow(t("pref-row-exclusions"), prefs.excludedActionIds),
      sub:
        prefs.excludedActionIds.length > 0
          ? tPre("confirmed-exclusions-count", {
              count: prefs.excludedActionIds.length,
            })
          : t("status-not-set-sub"),
    },
    {
      label: t("pref-row-weights"),
      requirement: t("req-optional"),
      status: (isCustom ? "custom" : "optional") as InputStatus,
      statusLabel: isCustom
        ? tPre("custom-weights-active")
        : t("status-weights-default"),
      sub: t("pref-row-weights-sub"),
    },
  ];

  return (
    <DemoShell
      lng={lng}
      city={city}
      track={track}
      segment="preflight"
      screenId={screenId}
      title={t("step-preflight")}
      step="preflight"
      stepsDone={{
        preferences: Boolean(state.visited.preferences),
        preflight: true,
      }}
      openPoints={
        track === "adaptation"
          ? [t("open-preflight-weights")]
          : [t("open-mitigation-review")]
      }
    >
      {!isReady ? null : (
        <VStack alignItems="stretch" gap="l">
          <BodyLarge color="content.secondary">{tPre("description")}</BodyLarge>

          <Card.Root borderColor="border.overlay">
            <Card.Body p="l">
              <VStack alignItems="stretch" gap="s">
                <TitleMedium color="content.primary">
                  {tPre("data-completeness-title")}
                </TitleMedium>
                <BodyMedium color="content.secondary">
                  {t("preflight-nothing-mandatory")}
                </BodyMedium>
                <VStack alignItems="stretch" gap="0">
                  {rows.map((row, i) => (
                    <Row
                      key={row.label}
                      {...row}
                      isLast={i === rows.length - 1}
                    />
                  ))}
                </VStack>
                <BodySmall color="content.tertiary">
                  {t("legal-screening-note")}
                </BodySmall>
              </VStack>
            </Card.Body>
          </Card.Root>

          <Card.Root borderColor="border.overlay">
            <Card.Body p="l">
              <VStack alignItems="stretch" gap="m">
                <HStack gap="s" alignItems="center" flexWrap="wrap">
                  <TitleMedium color="content.primary">
                    {tPre("scoring-weights-title")}
                  </TitleMedium>
                  <MeedStatusTag
                    tone={isCustom ? "warning" : "neutral"}
                    ml="auto"
                  >
                    {isCustom
                      ? tPre("custom-weights-active")
                      : tPre("badge-optional")}
                  </MeedStatusTag>
                </HStack>
                <BodyMedium color="content.secondary">
                  {tPre("scoring-weights-description")}
                </BodyMedium>
                <VStack alignItems="stretch" gap="l">
                  {WEIGHT_KEYS.map((k) => (
                    <WeightSlider
                      key={k}
                      label={tPre(`weight-${k}`)}
                      description={t(`weight-${k}-description-${track}`)}
                      value={weights[k]}
                      defaultValue={DEFAULT_WEIGHTS[k]}
                      onChange={(v) =>
                        setPreferences({ weights: rebalance(weights, k, v) })
                      }
                      t={tPre}
                    />
                  ))}
                </VStack>
                <HStack gap="s" flexWrap="wrap" alignItems="center">
                  <BodySmall
                    color={
                      total === 100
                        ? "content.secondary"
                        : "sentiment.warningDefault"
                    }
                  >
                    {tPre("weights-total", { total })}
                  </BodySmall>
                  {isCustom && (
                    <MeedButton
                      variant="outlined"
                      minW="auto"
                      px="m"
                      onClick={() =>
                        setPreferences({ weights: { ...DEFAULT_WEIGHTS } })
                      }
                    >
                      {tPre("reset-to-defaults")}
                    </MeedButton>
                  )}
                </HStack>
              </VStack>
            </Card.Body>
          </Card.Root>

          <VStack alignItems="stretch" gap="s">
            <HStack
              gap="s"
              px="m"
              py="s"
              borderRadius="rounded"
              bg="sentiment.positiveOverlay"
              alignItems="center"
            >
              <BodySmall color="interactive.tertiary">
                {hasPreferences
                  ? tPre("gate-ready")
                  : t("gate-preferences-optional")}
              </BodySmall>
            </HStack>
            <HStack justifyContent="flex-end">
              <MeedButton
                minW="auto"
                px="l"
                leftIcon={<Icon as={LuZap} boxSize="16px" />}
                onClick={() =>
                  router.push(trackHref(lng, city.slug, track, "processing"))
                }
              >
                {tPre("generate-ranking-cta")}
              </MeedButton>
            </HStack>
          </VStack>
        </VStack>
      )}
    </DemoShell>
  );
}
