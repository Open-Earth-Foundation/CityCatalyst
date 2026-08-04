"use client";
import React from "react";
import { Box, Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { TitleMedium, TitleLarge } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import {
  MeedStatusTag,
  STATUS_LABEL_KEY,
  STATUS_TONE,
} from "../../../components/MeedStatusTag";
import { MeedMeter } from "../../../components/MeedMeter";
import { MeedInfoTip } from "../../../components/MeedInfoTip";
import type { MeedPolicyBacking } from "./rankingFacts";
import {
  MEED_CONTEXT_AREAS,
  contextSummary,
  type MeedContextArea,
  type MeedContextFacts,
} from "./contextAreas";

interface Stat {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}

function StatTile({ label, value, sub, tone }: Stat) {
  const color =
    tone === "positive"
      ? "sentiment.positiveDefault"
      : tone === "negative"
        ? "sentiment.negativeDefault"
        : "content.primary";
  return (
    <Box
      borderWidth="1px"
      borderColor="border.neutral"
      borderRadius="8px"
      bg="base.light"
      px="m"
      py="m"
    >
      <Overline color="content.tertiary">{label}</Overline>
      <TitleLarge color={color} mt="xs" fontVariantNumeric="tabular-nums">
        {value}
      </TitleLarge>
      {sub && (
        <Caption color="content.tertiary" mt="xs">
          {sub}
        </Caption>
      )}
    </Box>
  );
}

/** The stats an area can quote, or an empty list when it has none of its own. */
function statsFor(
  area: MeedContextArea,
  facts: MeedContextFacts,
  backing: MeedPolicyBacking,
  t: TFunction,
): Stat[] {
  const unknown = t("stat-unknown");
  switch (area.key) {
    case "emissions":
      return [
        {
          label: t("stat-total-emissions"),
          value: facts.emissionsText ?? unknown,
        },
        {
          label: t("stat-inventory-year"),
          value: facts.inventoryYear ? String(facts.inventoryYear) : unknown,
        },
      ];
    case "regulations":
      return [
        {
          label: t("stat-included"),
          value: String(facts.rankedCount),
          sub: t("stat-included-sub"),
          tone: "positive",
        },
        {
          label: t("stat-excluded"),
          value:
            facts.excludedCount !== null
              ? String(facts.excludedCount)
              : unknown,
          sub: t("stat-excluded-sub"),
          tone: facts.excludedCount ? "negative" : undefined,
        },
      ];
    case "policy":
      return [
        {
          label: t("stat-strongly-backed"),
          value: String(backing.strong),
          sub: t("stat-strongly-backed-sub"),
        },
        {
          label: t("stat-moderate-backing"),
          value: String(backing.moderate),
          sub: t("stat-moderate-backing-sub"),
        },
      ];
    default:
      return [];
  }
}

/**
 * The "Context breakdown" tab: one section per input that shaped the ranking,
 * each showing what the ranking actually used and a way back to the screen
 * where it was entered.
 *
 * Areas the prioritizer does not report numbers for fall back to the live
 * detail line their wizard step wrote, rather than a fabricated statistic.
 */
export function ContextBreakdown({
  facts,
  backing,
  t,
  tMeed,
  hrefFor,
}: {
  facts: MeedContextFacts;
  backing: MeedPolicyBacking;
  t: TFunction;
  /** Bound to the `meed` namespace, for the shared step-status labels. */
  tMeed: TFunction;
  hrefFor: (segment: string) => string;
}) {
  const areas = MEED_CONTEXT_AREAS.filter((area) => area.segment);

  return (
    <VStack alignItems="stretch" gap="l">
      {areas.map((area) => {
        const stats = statsFor(area, facts, backing, t);
        const status = facts.states[area.key]?.status ?? "not-started";
        return (
          <Card.Root
            key={area.key}
            borderWidth="1px"
            borderColor="border.neutral"
          >
            <Card.Body display="flex" flexDirection="column" gap="m">
              <HStack
                justifyContent="space-between"
                alignItems="flex-start"
                gap="s"
              >
                <HStack gap="s" alignItems="center">
                  <Icon as={area.icon} boxSize="18px" color="content.link" />
                  <TitleMedium color="content.primary">
                    {t(area.titleKey)}
                  </TitleMedium>
                  {area.key === "regulations" && (
                    <MeedInfoTip
                      content={t("legal-filter-info")}
                      ariaLabel={t("legal-filter-info-label")}
                    />
                  )}
                </HStack>
                <MeedStatusTag tone={STATUS_TONE[status]}>
                  {tMeed(STATUS_LABEL_KEY[status])}
                </MeedStatusTag>
              </HStack>

              <BodySmall color="content.secondary">
                {t(area.descriptionKey)}
              </BodySmall>

              {stats.length > 0 ? (
                <SimpleGrid columns={{ base: 1, md: stats.length }} gap="m">
                  {stats.map((stat) => (
                    <StatTile key={stat.label} {...stat} />
                  ))}
                </SimpleGrid>
              ) : (
                <BodySmall color="content.primary">
                  {contextSummary(area, facts, t)}
                </BodySmall>
              )}

              {area.key === "policy" && backing.average !== null && (
                <MeedMeter
                  value={backing.average}
                  tone="info"
                  label={t("stat-average-alignment")}
                  valueText={`${Math.round(backing.average * 100)}%`}
                  description={t("stat-average-alignment-sub")}
                />
              )}

              <Box
                asChild
                display="inline-flex"
                alignSelf="flex-start"
                borderRadius="4px"
                _focusVisible={{
                  outline: "2px solid",
                  outlineColor: "content.link",
                  outlineOffset: "2px",
                }}
              >
                <NextLink href={hrefFor(area.segment as string)}>
                  <HStack gap="xs">
                    <LabelMedium color="content.link">
                      {t("context-view-details")}
                    </LabelMedium>
                    <Icon
                      as={LuArrowRight}
                      boxSize="14px"
                      color="content.link"
                    />
                  </HStack>
                </NextLink>
              </Box>
            </Card.Body>
          </Card.Root>
        );
      })}
    </VStack>
  );
}
