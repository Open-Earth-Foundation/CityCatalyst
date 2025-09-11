// only render map on the client
import dynamic from "next/dynamic";
import type { TFunction } from "i18next";
import type { PopulationAttributes } from "@/models/Population";
import { useGetOCCityDataQuery } from "@/services/api";
import { useMemo } from "react";
import {
  Box,
  Heading,
  Icon,
  Spinner,
  Text,
  HStack,
  VStack,
} from "@chakra-ui/react";
import { CircleFlag } from "react-circle-flags";
import { MdGroup, MdInfoOutline, MdOutlineAspectRatio } from "react-icons/md";
import { Tooltip } from "@/components/ui/tooltip";
import {
  formatEmissions,
  getShortenNumberUnit,
  shortenNumber,
} from "@/util/helpers";
import Link from "next/link";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { CityWithProjectDataResponse, InventoryResponse } from "@/util/types";
import { TitleMedium } from "@/components/Texts/Title";
import { DisplayMedium } from "@/components/Texts/Display";
import { HeadlineSmall } from "@/components/Texts/Headline";
import { BodyMedium } from "@/components/Texts/Body";
import { FiArrowUpRight } from "react-icons/fi";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

interface HeroProps {
  city: CityWithProjectDataResponse;
  ghgiCityData?: InventoryResponse;
  year: number;
  isPublic: boolean;
  isLoading: boolean;
  t: TFunction;
  population?: PopulationAttributes;
}

export function Hero({
  city,
  ghgiCityData,
  year,
  isLoading: isInventoryLoading,
  isPublic,
  population,
  t,
}: HeroProps) {
  const { data: cityData } = useGetOCCityDataQuery(city?.locode!, {
    skip: !city?.locode,
  });

  const formattedEmissions = ghgiCityData?.totalEmissions
    ? formatEmissions(ghgiCityData.totalEmissions)
    : { value: t("n-a"), unit: "" };

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
    <Box bg="base.light" py={12} w="full">
      <Box maxW="1090px" mx="auto">
        <HStack align="center" gap={8}>
          {/* Left Panel - Text Information */}
          <VStack align="start" flex={1} gap={6}>
            {/* Project Title */}
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
                <HStack gap={2} align="baseline">
                  <Icon
                    as={FiArrowUpRight}
                    boxSize={6}
                    color="sentiment.negativeDefault"
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
                      t("n-a")
                    )}
                  </HeadlineSmall>
                  <Tooltip
                    content={
                      <>
                        {t("total-emissions-in-year", {
                          year: ghgiCityData?.year,
                        })}
                      </>
                    }
                  >
                    <Icon
                      as={MdInfoOutline}
                      boxSize={4}
                      color="content.secondary"
                      cursor="pointer"
                    />
                  </Tooltip>
                </HStack>
                <BodyMedium color="content.tertiary">
                  {t("total-emissions-in-year", { year: ghgiCityData?.year })}
                </BodyMedium>
              </VStack>
              {/* Land Area */}
              <VStack align="start" gap={2}>
                <HStack gap={2} align="baseline">
                  <Icon
                    as={MdOutlineAspectRatio}
                    boxSize={5}
                    color="content.primary"
                  />
                  <HeadlineSmall
                    fontSize="2xl"
                    fontWeight="bold"
                    color="content.primary"
                    fontFamily="heading"
                  >
                    {city.area && city.area > 0 ? (
                      <>
                        {Math.round(city.area).toLocaleString()}
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
                      t("n-a")
                    )}
                  </HeadlineSmall>
                  <Tooltip
                    content={
                      <>
                        {t("source-open-climate")}
                        <br />
                        {t("population-year", { year: population?.year })}
                      </>
                    }
                  >
                    <Icon
                      as={MdInfoOutline}
                      boxSize={4}
                      color="content.secondary"
                      cursor="pointer"
                    />
                  </Tooltip>
                </HStack>
                <BodyMedium color="content.tertiary">
                  {t("total-land-area")}
                </BodyMedium>
              </VStack>
            </HStack>
          </VStack>

          {/* Right Panel - Map */}
          <Box h="317px">
            {city ? (
              <CityMap locode={city?.locode ?? null} width={422} height={317} />
            ) : (
              isInventoryLoading && (
                <Spinner size="lg" color="content.primary" />
              )
            )}
          </Box>
        </HStack>
      </Box>
    </Box>
  );
}
