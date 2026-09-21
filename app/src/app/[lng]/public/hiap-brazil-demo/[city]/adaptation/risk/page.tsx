"use client";
import React, { useState } from "react";
import { Card, HStack, Icon, SimpleGrid, Tabs, VStack } from "@chakra-ui/react";
import { LuExternalLink, LuInfo, LuMapPinOff } from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { Link } from "@chakra-ui/react";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { DemoShell } from "../../../_components/DemoShell";
import {
  RiskCellTable,
  indexTone,
  type RiskScenario,
} from "../../../_components/RiskCellGrid";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTABRASIL_URL } from "../../../_lib/links";
import {
  RISK_CELLS,
  SECTOR_LABEL,
  UNCOVERED_HAZARD_LABEL,
} from "../../../_lib/riskCells";
import { pick } from "../../../_lib/localized";

const SCENARIOS: RiskScenario[] = ["today", "2030", "2050"];

/** BR-A2 — the city's AdaptaBrasil risk profile. */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const [scenario, setScenario] = useState<RiskScenario>("today");

  const top = RISK_CELLS.map((c) => ({ c, r: city.risk[c.key] }))
    .filter(
      (
        x,
      ): x is { c: (typeof RISK_CELLS)[number]; r: NonNullable<typeof x.r> } =>
        Boolean(x.r),
    )
    .sort((a, b) => b.r.index - a.r.index)
    .slice(0, 4);

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="risk"
      screenId={SCREEN_IDS.adaptation.risk}
      title={t("risk-title")}
      description={t("risk-intro")}
      backLabel={t("back-to-home")}
    >
      <HStack
        gap="s"
        px="m"
        py="s"
        borderRadius="rounded"
        bg="background.neutral"
        alignItems="flex-start"
        alignSelf="flex-start"
      >
        <Icon as={LuInfo} boxSize="16px" color="content.link" mt="2px" />
        <Caption color="content.secondary">{t("risk-weight-note")}</Caption>
      </HStack>

      <SimpleGrid columns={{ base: 2, md: 4 }} gap="m">
        {top.map(({ c, r }) => (
          <Card.Root key={c.key} borderColor="border.overlay" h="full">
            <Card.Body p="m">
              <VStack alignItems="flex-start" gap="s">
                <Overline color="content.tertiary">
                  {pick(c.label, lng)}
                </Overline>
                <TitleMedium
                  color="content.primary"
                  fontVariantNumeric="tabular-nums"
                >
                  {r.index.toFixed(2)}
                </TitleMedium>
                <MeedStatusTag tone={indexTone(r.index)}>
                  {t(`risk-level-${indexTone(r.index)}`)}
                </MeedStatusTag>
                <Caption color="content.tertiary">
                  {pick(SECTOR_LABEL[c.sector], lng)}
                </Caption>
              </VStack>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>

      <VStack alignItems="stretch" gap="m">
        <HStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="m"
          flexWrap="wrap"
        >
          <VStack alignItems="stretch" gap="xs">
            <TitleMedium color="content.primary">
              {t("risk-table-title")}
            </TitleMedium>
            <BodySmall color="content.secondary">
              {t("risk-table-description")}
            </BodySmall>
          </VStack>
          <Tabs.Root
            variant="enclosed"
            size="sm"
            value={scenario}
            onValueChange={(d) => setScenario(d.value as RiskScenario)}
          >
            <Tabs.List>
              {SCENARIOS.map((s) => (
                <Tabs.Trigger key={s} value={s} _focusVisible={FOCUS_RING}>
                  {t(`risk-scenario-${s}`)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs.Root>
        </HStack>
        {scenario !== "today" && (
          <HStack
            gap="s"
            px="m"
            py="s"
            borderRadius="rounded"
            bg="sentiment.warningOverlay"
            alignItems="flex-start"
          >
            <Icon
              as={LuInfo}
              boxSize="16px"
              color="sentiment.warningDefault"
              mt="2px"
            />
            <BodySmall color="content.secondary">
              {t("risk-scenario-note")}
            </BodySmall>
          </HStack>
        )}
        <RiskCellTable city={city} lng={lng} t={t} scenario={scenario} />
        <Caption color="content.tertiary">{t("risk-hazard-note")}</Caption>
      </VStack>

      <Card.Root borderColor="sentiment.warningDefault">
        <Card.Body>
          <VStack alignItems="stretch" gap="s">
            <HStack gap="s" alignItems="center">
              <Icon
                as={LuMapPinOff}
                boxSize="18px"
                color="sentiment.warningDefault"
              />
              <LabelLarge color="content.primary">
                {t("risk-not-covered-title")}
              </LabelLarge>
            </HStack>
            <BodyMedium color="content.secondary">
              {t("risk-not-covered-body")}
            </BodyMedium>
            <HStack gap="xs" flexWrap="wrap">
              {(
                Object.keys(
                  UNCOVERED_HAZARD_LABEL,
                ) as (keyof typeof UNCOVERED_HAZARD_LABEL)[]
              ).map((h) => (
                <MeedStatusTag key={h} tone="warning">
                  {pick(UNCOVERED_HAZARD_LABEL[h], lng)}
                </MeedStatusTag>
              ))}
              <MeedStatusTag tone="neutral">
                {t("risk-not-covered-infra")}
              </MeedStatusTag>
            </HStack>
            {city.coastal && (
              <BodySmall color="sentiment.warningDefault">
                {t("risk-coastal-note", { city: city.name })}
              </BodySmall>
            )}
          </VStack>
        </Card.Body>
      </Card.Root>

      <Link
        href={ADAPTABRASIL_URL}
        target="_blank"
        rel="noreferrer"
        color="content.link"
        fontFamily="heading"
        fontSize="label.md"
        fontWeight="semibold"
        alignSelf="flex-start"
        _focusVisible={FOCUS_RING}
      >
        <HStack gap="xs">
          <span>{t("risk-source-link")}</span>
          <Icon as={LuExternalLink} boxSize="14px" />
        </HStack>
      </Link>
    </DemoShell>
  );
}
