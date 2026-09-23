"use client";
import React from "react";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import { coBenefitIcon, coBenefitLabel } from "./coBenefits";
import type { MeedCoBenefitTally } from "./coBenefits";

/** "+1.5" / "−1" — a signed magnitude, no trailing zeros. */
export function formatMagnitude(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(Math.abs(rounded))
    : Math.abs(rounded).toFixed(1);
  return rounded < 0 ? `−${text}` : `+${text}`;
}

/**
 * What the top picks deliver beyond emissions reduction: one box per
 * co-benefit, most common first, each saying how many of the top actions
 * carry it and — when the catalog scores co-benefits — how strongly.
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
      <SimpleGrid
        columns={{ base: 2, md: 3, lg: Math.min(benefits.length, 6) }}
        gap="m"
      >
        {benefits.map((benefit) => (
          <Card.Root
            key={benefit.key}
            borderWidth="1px"
            borderColor="border.neutral"
            h="full"
          >
            <Card.Body p="m">
              <VStack alignItems="flex-start" gap="s" h="full">
                <HStack justifyContent="space-between" w="full" gap="s">
                  <Icon
                    as={coBenefitIcon(benefit.key)}
                    boxSize="24px"
                    color="content.link"
                  />
                  {benefit.mean !== null && (
                    <MeedStatusTag
                      tone={benefit.mean < 0 ? "negative" : "positive"}
                    >
                      {formatMagnitude(benefit.mean)}
                    </MeedStatusTag>
                  )}
                </HStack>
                <LabelMedium color="content.primary">
                  {coBenefitLabel(benefit.key, t)}
                </LabelMedium>
                <BodySmall color="content.tertiary" mt="auto">
                  {t("cobenefit-count", { count: benefit.count, total })}
                </BodySmall>
              </VStack>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>
    </VStack>
  );
}
