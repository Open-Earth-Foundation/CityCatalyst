"use client";
import React from "react";
import { HStack, Icon, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { LabelLarge } from "@/components/package/Texts/Label";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import { coBenefitIcon, coBenefitLabel } from "./coBenefits";
import type { MeedCoBenefitTally } from "./coBenefits";

/**
 * What the top picks deliver beyond emissions reduction: one row of tags,
 * most common first. Six identical cards said the same thing with twenty
 * times the pixels.
 *
 * Renders nothing when `benefits` is empty — the caller derives the tally from
 * the ranking evidence and the action catalog, and neither source is
 * guaranteed to carry co-benefits.
 */
export function CoBenefitStrip({
  benefits,
  total,
  t,
}: {
  benefits: MeedCoBenefitTally[];
  /** How many top actions the counts are out of. */
  total: number;
  t: TFunction;
}) {
  if (benefits.length === 0) return null;

  return (
    <VStack alignItems="stretch" gap="s">
      <VStack alignItems="stretch" gap="xs">
        <LabelLarge color="content.primary">{t("cobenefits-title")}</LabelLarge>
        <BodySmall color="content.secondary">
          {t("cobenefits-description")}
        </BodySmall>
      </VStack>
      <HStack gap="s" flexWrap="wrap">
        {benefits.map((benefit) => (
          <MeedStatusTag key={benefit.key} tone="neutral">
            <HStack gap="xs" alignItems="center">
              <Icon
                as={coBenefitIcon(benefit.key)}
                boxSize="14px"
                color="content.link"
              />
              <span>
                {t("cobenefit-tag", {
                  label: coBenefitLabel(benefit.key, t),
                  count: benefit.count,
                  total,
                })}
              </span>
            </HStack>
          </MeedStatusTag>
        ))}
      </HStack>
    </VStack>
  );
}
