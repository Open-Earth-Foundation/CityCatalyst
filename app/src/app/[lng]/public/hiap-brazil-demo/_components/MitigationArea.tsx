"use client";
import React from "react";
import { Card, HStack, Icon, Table, VStack } from "@chakra-ui/react";
import { LuInfo } from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedShareBar } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedShareBar";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { sectorShares } from "@/app/[lng]/cities/[cityId]/MEED/components/sectorShares";
import { SECTORS } from "@/util/constants";
import type { SectorEmission } from "@/util/types";
import { formatEmissions } from "@/util/helpers";
import { cityFromSlug } from "../_lib/useTrack";
import { useDemoT, useTrackT } from "../_lib/useDemoT";
import { DemoShell } from "./DemoShell";

type Area = "emissions" | "legal" | "finance" | "policy" | "context";

/**
 * Mitigation output areas. Emissions is real (fixture inventory by sector);
 * the other four keep the adaptation structure and say so — their mitigation
 * content is what the Oct 21 review will settle.
 */
export function MitigationArea({
  lng,
  citySlug,
  area,
}: {
  lng: string;
  citySlug: string;
  area: Area;
}) {
  const city = cityFromSlug(citySlug);
  const { t } = useDemoT(lng);
  const tMeed = useTrackT(lng, "mitigation", "meed");
  const tResults = useTrackT(lng, "mitigation", "meed-results");
  const total = Object.values(city.inventory.bySector).reduce(
    (s, v) => s + v,
    0,
  );
  const bySector: SectorEmission[] = SECTORS.map((s) => ({
    sectorName: s.name,
    co2eq: BigInt(Math.round((city.inventory.bySector[s.name] ?? 0) * 1000)),
    percentage: 0,
  }));
  const shares = sectorShares(bySector);
  const emissions = formatEmissions(total * 1000);

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="mitigation"
      segment={area}
      screenId="BR-M5"
      title={t(`m-area-${area}-title`)}
      description={t(`m-area-${area}-intro`)}
      backLabel={t("back-to-home")}
      openPoints={[t("open-mitigation-review")]}
    >
      {area === "emissions" ? (
        <VStack alignItems="stretch" gap="l">
          <Card.Root borderColor="border.overlay">
            <Card.Body>
              <VStack alignItems="stretch" gap="m">
                <HStack justifyContent="space-between" flexWrap="wrap" gap="m">
                  <VStack alignItems="flex-start" gap="0">
                    <Caption color="content.tertiary">
                      {tMeed("total-ghg-emissions")}
                    </Caption>
                    <TitleMedium color="content.primary">
                      {emissions.value} {emissions.unit}
                    </TitleMedium>
                  </VStack>
                  <VStack alignItems="flex-start" gap="0">
                    <Caption color="content.tertiary">
                      {tMeed("inventory-year")}
                    </Caption>
                    <TitleMedium color="content.primary">
                      {city.inventory.year}
                    </TitleMedium>
                  </VStack>
                </HStack>
                <MeedShareBar
                  segments={shares.map((s) => ({
                    label: tResults(`sector-short-${s.name}`),
                    value: s.share,
                    color: `sectors.${s.referenceNumber}`,
                  }))}
                  ariaLabel={tResults("sector-share-tip-title")}
                  tipTitle={tResults("sector-share-tip-title")}
                  t={tResults}
                />
              </VStack>
            </Card.Body>
          </Card.Root>
          <Card.Root overflow="hidden" borderColor="border.neutral">
            <Table.Root size="md">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>
                    {tMeed("column-sector")}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="end">
                    {tMeed("column-emissions")}
                  </Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="end">
                    {tMeed("column-share")}
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {shares.map((s) => (
                  <Table.Row key={s.name}>
                    <Table.Cell>
                      <LabelMedium color="content.primary">
                        {tMeed(`sector-${s.name}`)}
                      </LabelMedium>
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      <BodySmall
                        color="content.secondary"
                        fontVariantNumeric="tabular-nums"
                      >
                        {t("m-emissions-value", {
                          value: (
                            city.inventory.bySector[s.name] / 1000
                          ).toFixed(1),
                        })}
                      </BodySmall>
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      <BodySmall
                        color="content.secondary"
                        fontVariantNumeric="tabular-nums"
                      >
                        {Math.round(s.share * 100)}%
                      </BodySmall>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Card.Root>
          <BodySmall color="content.tertiary">
            {t("m-emissions-note")}
          </BodySmall>
        </VStack>
      ) : (
        <Card.Root borderColor="sentiment.warningDefault">
          <Card.Body>
            <HStack gap="s" alignItems="flex-start">
              <Icon
                as={LuInfo}
                boxSize="18px"
                color="sentiment.warningDefault"
                mt="2px"
              />
              <VStack alignItems="flex-start" gap="xs">
                <HStack gap="s" flexWrap="wrap">
                  <LabelLarge color="content.primary">
                    {t("m-area-provisional-title")}
                  </LabelLarge>
                  <MeedStatusTag tone="warning">
                    {t("mitigation-provisional-tag")}
                  </MeedStatusTag>
                </HStack>
                <BodyMedium color="content.secondary">
                  {t(`m-area-${area}-provisional`)}
                </BodyMedium>
              </VStack>
            </HStack>
          </Card.Body>
        </Card.Root>
      )}
    </DemoShell>
  );
}
