"use client";
import React from "react";
import { HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Slider } from "@/components/ui/slider";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { DemoWeights } from "../../_lib/types";
import { DEFAULT_WEIGHTS } from "../../_lib/state";
import { Level } from "./Level";
import { TextLink } from "./TextLink";

const WEIGHT_KEYS: (keyof DemoWeights)[] = [
  "impact",
  "alignment",
  "feasibility",
];

/** Moving one slider redistributes the remainder proportionally across the other two. */
export function rebalance(
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

export const isCustomWeights = (w: DemoWeights) =>
  WEIGHT_KEYS.some((k) => w[k] !== DEFAULT_WEIGHTS[k]);

/**
 * The three pillar sliders of the pre-flight screen, as a block the ranking
 * panel can tuck under "Advanced". Same arithmetic as `TrackPreflight`.
 */
export function WeightSliders({
  weights,
  onChange,
  t,
  tPre,
}: {
  weights: DemoWeights;
  onChange: (next: DemoWeights) => void;
  /** Demo namespace. */
  t: TFunction;
  /** `meed-preflight` namespace, for the pillar names and value text. */
  tPre: TFunction;
}) {
  const total = weights.impact + weights.alignment + weights.feasibility;
  const isCustom = isCustomWeights(weights);
  return (
    <VStack alignItems="stretch" gap="l">
      {WEIGHT_KEYS.map((k) => {
        const value = weights[k];
        const defaultValue = DEFAULT_WEIGHTS[k];
        const isDefault = value === defaultValue;
        return (
          <VStack key={k} alignItems="stretch" gap="s">
            <HStack justifyContent="space-between" alignItems="center" gap="s">
              <VStack alignItems="flex-start" gap="0" minW="0" flex="1">
                <LabelLarge color="content.primary">
                  {tPre(`weight-${k}`)}
                </LabelLarge>
                <BodySmall color="content.tertiary">
                  {t(`weight-${k}-description-adaptation`)}
                </BodySmall>
              </VStack>
              <LabelLarge
                color={isDefault ? "content.secondary" : "content.link"}
                flexShrink={0}
                fontVariantNumeric="tabular-nums"
              >
                {value}%
              </LabelLarge>
            </HStack>
            <Slider
              value={[value]}
              min={5}
              max={90}
              step={1}
              marks={[defaultValue]}
              aria-label={[tPre(`weight-${k}`)]}
              getAriaValueText={(d: { value: number }) =>
                tPre("weight-value-text", { value: d.value })
              }
              onValueChange={(d: { value: number[] }) =>
                onChange(rebalance(weights, k, d.value[0]))
              }
              _focusWithin={FOCUS_RING}
            />
            <BodySmall color="content.tertiary" textAlign="center">
              {isDefault
                ? tPre("weight-default", { value: defaultValue })
                : tPre("weight-adjusted", { value: defaultValue })}
            </BodySmall>
          </VStack>
        );
      })}
      <HStack gap="s" flexWrap="wrap" alignItems="center">
        <Level tone={total === 100 ? "positive" : "negative"}>
          {tPre("weights-total", { total })}
        </Level>
        {isCustom && (
          <TextLink
            arrow={false}
            muted
            onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
          >
            {tPre("reset-to-defaults")}
          </TextLink>
        )}
      </HStack>
    </VStack>
  );
}
