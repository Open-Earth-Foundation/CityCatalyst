"use client";
import React from "react";
import { Box, Grid, HStack, Icon, Link, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { Tooltip } from "@/components/ui/tooltip";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { CityFixture } from "../../_lib/types";
import { RISK_CELLS, SECTOR_HEX } from "../../_lib/riskCells";
import { pick } from "../../_lib/localized";
import { indexTone } from "../RiskCellGrid";
import { Level } from "./Level";
import { SECTOR_ICON } from "./SectorIcon";

/**
 * The first section of BR-N1, in its own box so it reads apart from the
 * actions: the city's three highest climate risks. Each one leads with its
 * icon and level, then the hazard; hovering or focusing it shows the
 * AdaptaBrasil index and the source, and a click opens that hazard on the
 * full risk profile.
 */
export function TopRisks({
  city,
  lng,
  t,
  href,
  title,
}: {
  city: CityFixture;
  lng: string;
  t: TFunction;
  /** The full risk profile. */
  href: string;
  title: string;
}) {
  const top = RISK_CELLS.map((c) => ({ c, r: city.risk[c.key] }))
    .filter(
      (
        x,
      ): x is { c: (typeof RISK_CELLS)[number]; r: NonNullable<typeof x.r> } =>
        Boolean(x.r),
    )
    .sort((a, b) => b.r.index - a.r.index)
    .slice(0, 3);
  if (top.length === 0) return null;
  const format = (v: number) =>
    v.toLocaleString(lng, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <Box
      as="section"
      aria-labelledby="top-risks-title"
      data-testid="top-risks"
      bg="base.light"
      borderWidth="1px"
      borderColor="border.neutral"
      borderRadius="rounded"
      px={{ base: "l", md: "xl" }}
      py="l"
    >
      <HStack
        justifyContent="space-between"
        alignItems={{ base: "flex-start", sm: "center" }}
        flexDirection={{ base: "column", sm: "row" }}
        gap="m"
      >
        <VStack alignItems="flex-start" gap="xs">
          <TitleLarge id="top-risks-title" as="h2" color="content.primary">
            {title}
          </TitleLarge>
          <BodySmall color="content.secondary">
            {t("next-section-risks-body", { city: city.name })}
          </BodySmall>
        </VStack>
        <Link
          asChild
          display="inline-flex"
          alignItems="center"
          gap="s"
          flexShrink={0}
          px="m"
          py="s"
          borderRadius="pill"
          borderWidth="1px"
          borderColor="content.link"
          color="content.link"
          fontFamily="heading"
          fontSize="label.lg"
          fontWeight="semibold"
          textDecoration="none"
          _hover={{ bg: "background.neutral", textDecoration: "none" }}
          _focusVisible={FOCUS_RING}
        >
          <NextLink href={href}>
            {t("next-risks-link")}
            <Icon as={LuArrowRight} boxSize="16px" />
          </NextLink>
        </Link>
      </HStack>

      <Grid
        templateColumns={{ base: "1fr", md: "repeat(3, minmax(0, 1fr))" }}
        mt="l"
        gap={{ base: "0", md: "0" }}
      >
        {top.map(({ c, r }, i) => {
          const tone = indexTone(r.index);
          const name = pick(c.label, lng);
          const tip = t("next-risk-tip", {
            driver: pick(c.hazardLabel, lng),
            value: format(r.index),
          });
          return (
            <Tooltip
              key={c.key}
              content={tip}
              showArrow
              openDelay={150}
              positioning={{ placement: "bottom" }}
            >
              <Link
                asChild
                data-testid="top-risk"
                display="flex"
                alignItems="center"
                gap="m"
                py="m"
                px={{ base: "0", md: i === 0 ? "0" : "l" }}
                borderTopWidth={{ base: i === 0 ? "0" : "1px", md: "0" }}
                borderLeftWidth={{ base: "0", md: i === 0 ? "0" : "1px" }}
                borderColor="border.overlay"
                textDecoration="none"
                _hover={{
                  textDecoration: "none",
                  "& h3": { color: "content.link" },
                }}
                _focusVisible={FOCUS_RING}
                aria-label={`${name}: ${t(`next-risk-level-${tone}`)}. ${tip}`}
              >
                <NextLink href={`${href}#${c.key}`}>
                  <Box
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    boxSize="48px"
                    borderRadius="full"
                    bg="background.neutral"
                    flexShrink={0}
                    aria-hidden
                  >
                    <Icon
                      as={SECTOR_ICON[c.sector]}
                      boxSize="26px"
                      color={SECTOR_HEX[c.sector]}
                    />
                  </Box>
                  <VStack alignItems="flex-start" gap="xs" minW={0}>
                    <Level tone={tone}>{t(`next-risk-level-${tone}`)}</Level>
                    <TitleMedium as="h3" color="content.primary">
                      {name}
                    </TitleMedium>
                  </VStack>
                </NextLink>
              </Link>
            </Tooltip>
          );
        })}
      </Grid>
    </Box>
  );
}
