"use client";
import React from "react";
import { Card, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { LabelLarge } from "@/components/package/Texts/Label";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { coBenefitIcon, coBenefitLabel } from "./coBenefits";
import type { MeedCoBenefitTally } from "./coBenefits";

/**
 * What the top picks deliver beyond emissions reduction.
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
      <SimpleGrid columns={{ base: 2, md: 3, lg: benefits.length }} gap="m">
        {benefits.map((benefit) => (
          <Card.Root
            key={benefit.key}
            borderWidth="1px"
            borderColor="border.neutral"
            h="full"
          >
            <Card.Body
              display="flex"
              flexDirection="column"
              alignItems="center"
              textAlign="center"
              gap="s"
              py="m"
            >
              <Icon
                as={coBenefitIcon(benefit.key)}
                boxSize="24px"
                color="content.link"
              />
              <BodySmall color="content.primary" fontWeight="semibold">
                {coBenefitLabel(benefit.key, t)}
              </BodySmall>
              <Caption color="content.tertiary">
                {t("cobenefit-count", { count: benefit.count, total })}
              </Caption>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>
    </VStack>
  );
}
