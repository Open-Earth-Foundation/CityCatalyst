"use client";
import React from "react";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import { LuInfo } from "react-icons/lu";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { pushBucket, PUSH_LABEL } from "../../../_lib/finance";
import { pick } from "../../../_lib/localized";

/** BR-A10 — socioeconomic context: shown, explicitly not scored (methodology §5, decision #3). */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const fmt = (v: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(lng === "pt" ? "pt-BR" : "en", opts).format(v);
  const items = [
    { key: "population", value: fmt(city.population), source: "IBGE 2022" },
    {
      key: "poverty",
      value: `${fmt(city.context.povertyRate, { maximumFractionDigits: 1 })}%`,
      source: "IBGE / CadÚnico",
    },
    {
      key: "informal",
      value: `${fmt(city.context.informalSettlementShare, { maximumFractionDigits: 1 })}%`,
      source: "IBGE 2022",
    },
    {
      key: "urban",
      value: `${fmt(city.context.urbanShare, { maximumFractionDigits: 1 })}%`,
      source: "IBGE 2022",
    },
    {
      key: "gdp",
      value: fmt(city.context.gdpPerCapitaBrl, {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }),
      source: "IBGE 2021",
    },
    {
      key: "hdi",
      value: fmt(city.context.hdi, { maximumFractionDigits: 3 }),
      source: "PNUD / Atlas Brasil",
    },
    {
      key: "capag",
      value: city.capag === "nd" ? "n.d." : city.capag,
      source: "STN, Jun 2026",
    },
    {
      key: "munic",
      value: `${city.financePush} / 14 · ${pick(PUSH_LABEL[pushBucket(city.financePush)], lng)}`,
      source: "IBGE MUNIC 2020–21",
    },
  ];

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="context"
      screenId={SCREEN_IDS.adaptation.context}
      title={t("context-title")}
      description={t("context-intro")}
      backLabel={t("back-to-home")}
    >
      <Card.Root borderColor="content.link">
        <Card.Body>
          <HStack gap="s" alignItems="flex-start">
            <Icon as={LuInfo} boxSize="18px" color="content.link" mt="2px" />
            <VStack alignItems="flex-start" gap="xs">
              <HStack gap="s" flexWrap="wrap">
                <LabelLarge color="content.primary">
                  {t("context-not-scored-title")}
                </LabelLarge>
                <MeedStatusTag tone="info">
                  {t("stat-context-not-scored")}
                </MeedStatusTag>
              </HStack>
              <BodyMedium color="content.secondary">
                {t("context-not-scored-body")}
              </BodyMedium>
            </VStack>
          </HStack>
        </Card.Body>
      </Card.Root>

      <VStack alignItems="stretch" gap="m">
        <TitleMedium color="content.primary">
          {t("context-indicators-title")}
        </TitleMedium>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap="m">
          {items.map((it) => (
            <Card.Root key={it.key} borderColor="border.overlay" h="full">
              <Card.Body p="m">
                <VStack alignItems="flex-start" gap="s">
                  <Overline color="content.tertiary">
                    {t(`ctx-${it.key}`)}
                  </Overline>
                  <TitleMedium
                    color="content.primary"
                    fontVariantNumeric="tabular-nums"
                  >
                    {it.value}
                  </TitleMedium>
                  <Caption color="content.tertiary">{it.source}</Caption>
                </VStack>
              </Card.Body>
            </Card.Root>
          ))}
        </SimpleGrid>
        <BodyMedium color="content.secondary">
          {t("context-vulnerability-note")}
        </BodyMedium>
      </VStack>
    </DemoShell>
  );
}
