"use client";
import React from "react";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import { LuInfo } from "react-icons/lu";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedInfoTip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedInfoTip";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { DemoShell } from "../../../../_components/DemoShell";
import { cityFromSlug } from "../../../../_lib/useTrack";
import { useDemoT } from "../../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../../_lib/hrefs";
import { cityContextItems } from "../../../../_components/next/CityContextDialog";
import { CityOutline } from "../../../../_components/next/CityOutline";

/** BR-A10 — socioeconomic context: shown, explicitly not scored (methodology §5, decision #3). */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const items = cityContextItems(city, lng);

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
          <HStack gap="xl" alignItems="flex-start" flexWrap="wrap">
            <CityOutline
              locode={city.locode}
              label={t("context-map-aria", { city: city.name })}
              emptyLabel={t("context-map-missing")}
              size={120}
            />
            <HStack gap="s" alignItems="flex-start" flex="1" minW="240px">
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
                  <HStack gap="xs" alignItems="center">
                    <Overline color="content.tertiary">
                      {t(`ctx-${it.key}`)}
                    </Overline>
                    <MeedInfoTip
                      content={t(`ctx-${it.key}-info`)}
                      ariaLabel={t(`ctx-${it.key}-info`)}
                    />
                  </HStack>
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
