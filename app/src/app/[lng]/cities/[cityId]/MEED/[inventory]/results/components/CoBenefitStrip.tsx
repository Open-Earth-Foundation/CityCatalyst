"use client";
import React from "react";
import { TitleLarge } from "@/components/package/Texts/Title";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import { LabelMedium } from "@/components/package/Texts/Label";
import { BodySmall, BodyMedium } from "@/components/package/Texts/Body";
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
  tradeOffs = [],
  total,
  t,
}: {
  benefits: MeedCoBenefitTally[];
  /** Adverse effects across the same actions; the block is omitted when empty. */
  tradeOffs?: MeedCoBenefitTally[];
  /** How many top actions the counts are out of. */
  total: number;
  t: TFunction;
}) {
  if (benefits.length === 0 && tradeOffs.length === 0) return null;

  return (
    <VStack alignItems="stretch" gap="l">
      {benefits.length > 0 && (
        <TallyBlock
          title={t("cobenefits-title")}
          description={t("cobenefits-description")}
          items={benefits}
          total={total}
          adverse={false}
          t={t}
        />
      )}
      {tradeOffs.length > 0 && (
        <TallyBlock
          title={t("tradeoffs-title")}
          description={t("tradeoffs-description")}
          items={tradeOffs}
          total={total}
          adverse
          t={t}
        />
      )}
    </VStack>
  );
}

function TallyBlock({
  title,
  description,
  items,
  total,
  adverse,
  t,
}: {
  title: string;
  description: string;
  items: MeedCoBenefitTally[];
  total: number;
  adverse: boolean;
  t: TFunction;
}) {
  return (
    <VStack alignItems="stretch" gap="s">
      <VStack alignItems="stretch" gap="xs">
        <TitleLarge color="content.primary">{title}</TitleLarge>
        <BodyMedium color="content.secondary">{description}</BodyMedium>
      </VStack>
      <SimpleGrid
        columns={{ base: 2, md: 3, lg: Math.min(items.length, 6) }}
        gap="m"
      >
        {items.map((item) => (
          <Card.Root
            key={item.key}
            borderWidth="1px"
            borderColor={
              adverse ? "sentiment.negativeDefault" : "border.neutral"
            }
            h="full"
          >
            <Card.Body p="l">
              <VStack alignItems="flex-start" gap="s" h="full">
                <HStack justifyContent="space-between" w="full" gap="s">
                  <Icon
                    as={adverse ? LuTriangleAlert : coBenefitIcon(item.key)}
                    boxSize="24px"
                    color={
                      adverse ? "sentiment.negativeDefault" : "content.link"
                    }
                  />
                  {item.mean !== null && (
                    <MeedStatusTag
                      tone={item.mean < 0 ? "negative" : "positive"}
                    >
                      {formatMagnitude(item.mean)}
                    </MeedStatusTag>
                  )}
                </HStack>
                <LabelMedium color="content.primary">
                  {coBenefitLabel(item.key, t)}
                </LabelMedium>
                <BodySmall color="content.tertiary" mt="auto">
                  {t("cobenefit-count", { count: item.count, total })}
                </BodySmall>
              </VStack>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>
    </VStack>
  );
}
