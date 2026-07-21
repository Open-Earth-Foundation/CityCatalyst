// only render map on the client
import dynamic from "next/dynamic";
import type { TFunction } from "i18next";
import type { PopulationAttributes } from "@/models/Population";
import { useGetOCCityDataQuery } from "@/services/api";
import { useMemo } from "react";
import { Box, Icon, Spinner, HStack, VStack, Text } from "@chakra-ui/react";
import { CircleFlag } from "react-circle-flags";
import { MdOutlineAspectRatio } from "react-icons/md";
import { InfoTooltip } from "@/components/InfoTooltip";
import { formatEmissions, formatNumber } from "@/util/helpers";
import Link from "next/link";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { CityWithProjectDataResponse, InventoryResponse } from "@/util/types";
import { TitleMedium } from "@/components/package/Texts/Title";
import { DisplayMedium } from "@/components/package/Texts/Display";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyMedium } from "@/components/package/Texts/Body";
import { HeatIcon } from "../icons";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

interface HeroProps {
  city: CityWithProjectDataResponse;
  ghgiCityData?: InventoryResponse;
  isPublic: boolean;
  isLoading: boolean;
  t: TFunction;
  population?: PopulationAttributes;
  hideMap?: boolean;
  numberFormat?: string;
}

export function Hero({
  city,
  ghgiCityData,
  isLoading: isInventoryLoading,
  isPublic,
  population,
  t,
  hideMap = false,
  numberFormat,
}: HeroProps) {
  const { data: cityData } = useGetOCCityDataQuery(city?.locode!, {
    skip: !city?.locode,
  });

  const formattedEmissions =
    ghgiCityData?.totalEmissions != null
      ? formatEmissions(ghgiCityData.totalEmissions, numberFormat)
      : { value: t("no-data"), unit: "" };

  const popWithDS = useMemo(
    () =>
      cityData?.population?.find(
        (p: { population: number; year: number }) =>
          p.population === population?.population &&
          p.year === population?.year,
      ),
    [cityData?.population, population?.population, population?.year],
  );

  return (
    <Box py={12} w="full">
      <Box maxW="1090px" mx="auto">
        <HStack align="center" gap={8}>
          {/* Left Panel - Text Information */}
          <VStack align="start" flex={1} gap={6}>
            {/* Project Title */}
            {!hideMap && (
              <TitleMedium color="base.dark">
                {!isPublic &&
                hasFeatureFlag(FeatureFlags.PROJECT_OVERVIEW_ENABLED) ? (
                  <Link href={`/public/project/${city?.projectId}`}>
                    {city?.project?.name === "cc_project_default"
                      ? t("default-project")
                      : city?.project?.name}
                  </Link>
                ) : city?.project?.name === "cc_project_default" ? (
                  t("default-project")
                ) : (
                  city?.project?.name
                )}
              </TitleMedium>
            )}

            {/* City Name with Flag */}
            <HStack align="center" gap={3}>
              <CircleFlag
                countryCode={city.locode?.substring(0, 2).toLowerCase() || ""}
                width={32}
                height={32}
              />
              <DisplayMedium color="base.dark" data-testid="hero-city-name">
                {city?.name}
              </DisplayMedium>
            </HStack>

            {/* Statistics */}
            <HStack gap={8} align="start">
              {/* Total co2 emissions */}
              <VStack align="start" gap={2}>
                <HStack gap={2} align="center">
                  <Icon
                    as={HeatIcon}
                    boxSize={6}
                    fill="content.tertiary"
                    mt={-1}
                  />
                  <HeadlineSmall
                    fontSize="2xl"
                    fontWeight="bold"
                    color="content.primary"
                    fontFamily="heading"
                  >
                    {formattedEmissions.value ? (
                      <>
                        {formattedEmissions.value}
                        <HeadlineSmall
                          as="span"
                          fontSize="lg"
                          fontWeight="bold"
                          fontFamily="heading"
                        >
                          {formattedEmissions.unit}
                        </HeadlineSmall>
                      </>
                    ) : (
                      t("no-data")
                    )}
                  </HeadlineSmall>
                  <InfoTooltip
                    contentProps={
                      ghgiCityData?.totalEmissions == null
                        ? {
                            bg: "content.secondary",
                            borderRadius: "minimal",
                            boxShadow: "shadow-light-md",
                          }
                        : undefined
                    }
                    content={
                      ghgiCityData?.totalEmissions != null
                        ? t("total-emissions-in-year", { year: ghgiCityData?.year })
                        : (
                          <Text
                            color="white"
                            textAlign="center"
                            fontFamily="body"
                            fontSize="xs"
                            fontWeight="medium"
                            lineHeight="16px"
                          >
                            {t("no-data-tooltip-line1")}
                            <br />
                            {t("no-data-tooltip-line2")}
                          </Text>
                        )
                    }
                  />
                </HStack>
                <BodyMedium color="content.tertiary">
                  {ghgiCityData?.year
                    ? t("total-emissions-in-year", { year: ghgiCityData.year })
                    : t("total-emissions")}
                </BodyMedium>
              </VStack>
              {/* Land Area */}
              <VStack align="start" gap={2}>
                <HStack gap={2} align="center">
                  <Icon
                    as={MdOutlineAspectRatio}
                    boxSize={5}
                    color="content.tertiary"
                    mt={-1}
                  />
                  <HeadlineSmall
                    fontSize="2xl"
                    fontWeight="bold"
                    color="content.primary"
                    fontFamily="heading"
                  >
                    {city.area && city.area > 0 ? (
                      <>
                        {formatNumber(Math.round(city.area), numberFormat)}
                        <HeadlineSmall
                          as="span"
                          fontSize="lg"
                          fontWeight="bold"
                          fontFamily="heading"
                        >
                          {t("km2")}
                        </HeadlineSmall>
                      </>
                    ) : (
                      t("no-data")
                    )}
                  </HeadlineSmall>
                  <InfoTooltip
                    contentProps={
                      !(city.area && city.area > 0)
                        ? {
                            bg: "content.secondary",
                            borderRadius: "minimal",
                            boxShadow: "shadow-light-md",
                          }
                        : undefined
                    }
                    content={
                      city.area && city.area > 0 ? (
                        <>
                          {t("source-open-climate")}
                          <br />
                          {t("population-year", { year: population?.year })}
                        </>
                      ) : (
                        <Text
                          color="white"
                          textAlign="center"
                          fontFamily="body"
                          fontSize="xs"
                          fontWeight="medium"
                          lineHeight="16px"
                        >
                          {t("no-data-tooltip-line1")}
                          <br />
                          {t("no-data-tooltip-line2")}
                        </Text>
                      )
                    }
                  />
                </HStack>
                <BodyMedium color="content.tertiary">
                  {t("total-land-area")}
                </BodyMedium>
              </VStack>
            </HStack>
          </VStack>

          {/* Right Panel - Map */}
          {!hideMap && (
            <Box h="317px">
              {city ? (
                <CityMap
                  locode={city?.locode ?? null}
                  width={422}
                  height={317}
                />
              ) : (
                isInventoryLoading && (
                  <Spinner size="lg" color="content.primary" />
                )
              )}
            </Box>
          )}
        </HStack>
      </Box>
    </Box>
  );
}
