"use client";
import React from "react";
import { HStack, SimpleGrid, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { MeedInfoTip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedInfoTip";
import type { CityFixture } from "../../_lib/types";
import { pushBucket, PUSH_LABEL } from "../../_lib/finance";
import { pick } from "../../_lib/localized";
import { CityOutline } from "./CityOutline";

/** The city-context indicators as a list for a dialog or a page. */
export function cityContextItems(city: CityFixture, lng: string) {
  const fmt = (v: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(lng === "pt" ? "pt-BR" : "en", opts).format(v);
  return [
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
}

/**
 * City context on demand (review feedback: "a box that opens once you ask
 * for city context"). Shown, never scored; the page BR-A10 stays for links.
 */
export function CityContextDialog({
  city,
  lng,
  open,
  onOpenChange,
  t,
}: {
  city: CityFixture;
  lng: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TFunction;
}) {
  const items = cityContextItems(city, lng);
  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      size="lg"
      scrollBehavior="inside"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("context-title")} · {city.name}
          </DialogTitle>
        </DialogHeader>
        <DialogBody pb="xl">
          <VStack alignItems="stretch" gap="l">
            <HStack gap="xl" alignItems="flex-start" flexWrap="wrap">
              <CityOutline
                locode={city.locode}
                label={t("context-map-aria", { city: city.name })}
                emptyLabel={t("context-map-missing")}
                size={140}
              />
              <BodyMedium color="content.secondary" flex="1" minW="240px">
                {t("context-not-scored-body")}
              </BodyMedium>
            </HStack>
            <SimpleGrid columns={{ base: 2, md: 4 }} gap="l">
              {items.map((it) => (
                <VStack key={it.key} alignItems="flex-start" gap="xs">
                  <HStack gap="xs" alignItems="center">
                    <Overline color="content.tertiary">
                      {t(`ctx-${it.key}`)}
                    </Overline>
                    <MeedInfoTip
                      content={t(`ctx-${it.key}-info`)}
                      ariaLabel={t(`ctx-${it.key}-info`)}
                    />
                  </HStack>
                  <LabelLarge color="content.primary">{it.value}</LabelLarge>
                  <BodySmall color="content.tertiary">{it.source}</BodySmall>
                </VStack>
              ))}
            </SimpleGrid>
            <BodySmall color="content.secondary">
              {t("context-vulnerability-note")}
            </BodySmall>
          </VStack>
        </DialogBody>
        <DialogCloseTrigger aria-label={t("next-dialog-close")} />
      </DialogContent>
    </DialogRoot>
  );
}
