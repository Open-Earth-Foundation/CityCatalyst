"use client";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import { LuLandmark } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { ROUTE_META, type ProfileAttrs } from "../labels";
import { LevelMeter } from "./LevelMeter";
import { RouteTag } from "./RouteTag";

export interface CityProfileCardProps {
  cityName: string;
  profile: ProfileAttrs;
  t: TFunction;
}

/** What the city brings to the table, and what the three routes mean. */
export function CityProfileCard({
  cityName,
  profile,
  t,
}: CityProfileCardProps) {
  return (
    <Card.Root borderColor="border.neutral">
      <Card.Body p="l">
        <VStack alignItems="stretch" gap="m">
          <TitleMedium color="content.primary">
            {t("financial-profile-title", { city: cityName })}
          </TitleMedium>

          <HStack
            gap="m"
            bg="background.neutral"
            borderRadius="rounded"
            px="m"
            py="m"
            alignItems="flex-start"
          >
            <Icon
              as={LuLandmark}
              boxSize="20px"
              color="content.secondary"
              mt="xs"
              flexShrink={0}
            />
            <VStack alignItems="flex-start" gap="xs">
              <LabelLarge color="content.primary">
                {t(profile.labelKey)}
              </LabelLarge>
              <BodyMedium color="content.secondary">
                {t(profile.descKey, { city: cityName })}
              </BodyMedium>
            </VStack>
          </HStack>

          {(profile.fa || profile.dc) && (
            <SimpleGrid columns={{ base: 1, sm: 2 }} gap="m">
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
            </SimpleGrid>
          )}

          <VStack alignItems="stretch" gap="s">
            <Overline>{t("route-legend-title")}</Overline>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap="m">
              {(["self", "cofinance", "support"] as const).map((key) => (
                <Card.Root key={key} h="full" borderColor="border.neutral">
                  <Card.Body p="m">
                    <VStack alignItems="flex-start" gap="s">
                      <RouteTag routeKey={key} t={t} />
                      <Caption color="content.secondary">
                        {t(ROUTE_META[key].taglineKey)}
                      </Caption>
                    </VStack>
                  </Card.Body>
                </Card.Root>
              ))}
            </SimpleGrid>
          </VStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
