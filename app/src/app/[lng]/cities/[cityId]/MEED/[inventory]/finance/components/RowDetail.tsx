"use client";
import { Separator, SimpleGrid, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { numericToLevel, profileAttrs } from "../labels";
import type { FeasibilityRow } from "../types";
import { FinanceMatches } from "./FinanceMatches";
import { LevelMeter } from "./LevelMeter";

export interface RowDetailProps {
  row: FeasibilityRow;
  cityId: string;
  cityName: string;
  t: TFunction;
}

/**
 * Detail for an expanded feasibility row: route reasoning, factor breakdown,
 * and lazily-fetched funding opportunities and funded projects (via the row's
 * relative Global-API links).
 */
export function RowDetail({ row, cityId, cityName, t }: RowDetailProps) {
  const inputs = row.inputs ?? {};
  const ciLevel = numericToLevel(inputs.action?.capital_intensity);
  const pcLevel = numericToLevel(inputs.action?.preparation_complexity);
  const profile = profileAttrs(inputs.city?.profile);

  return (
    <VStack alignItems="stretch" gap="m" px="l" py="m">
      {row.reason && (
        <BodyMedium color="content.secondary">{row.reason}</BodyMedium>
      )}

      {(ciLevel || pcLevel || profile.fa || profile.dc) && (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="l">
          {(ciLevel || pcLevel) && (
            <VStack alignItems="stretch" gap="m">
              <Overline>{t("what-action-needs")}</Overline>
              {ciLevel && (
                <LevelMeter
                  label={t("factor-capital-intensity")}
                  level={ciLevel}
                  dir="needs"
                  t={t}
                />
              )}
              {pcLevel && (
                <LevelMeter
                  label={t("factor-preparation-complexity")}
                  level={pcLevel}
                  dir="needs"
                  t={t}
                />
              )}
            </VStack>
          )}
          {(profile.fa || profile.dc) && (
            <VStack alignItems="stretch" gap="m">
              <Overline>{t("what-city-has", { city: cityName })}</Overline>
              {profile.fa && (
                <LevelMeter
                  label={t("factor-financial-autonomy")}
                  level={profile.fa}
                  dir="has"
                  t={t}
                />
              )}
              {profile.dc && (
                <LevelMeter
                  label={t("factor-delivery-capacity")}
                  level={profile.dc}
                  dir="has"
                  t={t}
                />
              )}
            </VStack>
          )}
        </SimpleGrid>
      )}

      <Separator borderColor="border.overlay" />

      <FinanceMatches row={row} cityId={cityId} t={t} />
    </VStack>
  );
}
