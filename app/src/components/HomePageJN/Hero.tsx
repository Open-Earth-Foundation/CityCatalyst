// only render map on the client
import dynamic from "next/dynamic";
import type { TFunction } from "i18next";
import type { PopulationAttributes } from "@/models/Population";
import { useGetOCCityDataQuery } from "@/services/api";
import { useMemo } from "react";
import { Box, Heading, Icon, Spinner, Text, Grid } from "@chakra-ui/react";
import { CircleFlag } from "react-circle-flags";
import { MdGroup, MdInfoOutline, MdOutlineAspectRatio } from "react-icons/md";
import { Tooltip } from "@/components/ui/tooltip";
import { Trans } from "react-i18next/TransWithoutContext";
import { getShortenNumberUnit, shortenNumber } from "@/util/helpers";
import Link from "next/link";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { CityWithProjectDataResponse } from "@/util/types";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

interface HeroProps {
  city: CityWithProjectDataResponse;
  year: number;
  isPublic: boolean;
  isLoading: boolean;
  t: TFunction;
  population?: PopulationAttributes;
}

export function Hero({
  city,
  year,
  isLoading: isInventoryLoading,
  isPublic,
  population,
  t,
}: HeroProps) {
  const { data: cityData } = useGetOCCityDataQuery(city?.locode!, {
    skip: !city?.locode,
  });

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
    <>
      <Box className="w-full h-[491px] pt-[150px]" px={8}>
        <Box className="flex mx-auto max-w-full w-[1090px]">
          <Box className="w-full h-[240px] flex flex-col justify-center">
            <Box className="flex h-[240px]">
              <Box className="flex gap-[24px] flex-col h-full w-full">
                <Text
                  fontSize="headline.sm"
                  color="base.dark"
                  lineHeight="32"
                  fontWeight="semibold"
                >
                  {t("welcome")}
                </Text>
                <Box className="flex flex-col gap-2">
                  {!isPublic &&
                  hasFeatureFlag(FeatureFlags.PROJECT_OVERVIEW_ENABLED) ? (
                    <Link href={`/public/project/${city?.projectId}`}>
                      <ProjectTitle city={city} t={t} />
                    </Link>
                  ) : (
                    <ProjectTitle city={city} t={t} />
                  )}
                  <Box className="flex items-center gap-4">
                    {city ? (
                      <>
                        <CircleFlag
                          countryCode={
                            city.locode?.substring(0, 2).toLowerCase() || ""
                          }
                          width={32}
                        />
                        <Heading
                          fontSize="display.md"
                          color="base.dark"
                          fontWeight="semibold"
                          lineHeight="52"
                          className="flex"
                        >
                          <span data-testid="hero-city-name">{city?.name}</span>
                        </Heading>
                      </>
                    ) : (
                      isInventoryLoading && <Spinner size="lg" color="white" />
                    )}
                  </Box>
                </Box>
                {/* --- GRID LAYOUT FOR STATS --- */}
                <Grid
                  templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
                  gap={8}
                  mt={6}
                >
                  {/* Population */}
                  <Box className="flex align-baseline gap-3">
                    <Icon as={MdGroup} boxSize={6} fill="base.dark" />
                    <Box>
                      <Box className="flex gap-1">
                        {population?.population ? (
                          <Text
                            fontFamily="heading"
                            color="base.dark"
                            fontSize="headline.sm"
                            fontWeight="semibold"
                            lineHeight="32"
                          >
                            {shortenNumber(population.population)}
                            <span className="text-[16px]">
                              {population?.population
                                ? getShortenNumberUnit(population.population)
                                : ""}
                            </span>
                          </Text>
                        ) : (
                          <Text
                            fontFamily="heading"
                            color="border.neutral"
                            fontSize="headline.sm"
                            fontWeight="semibold"
                            lineHeight="32"
                          >
                            {t("N/A")}
                          </Text>
                        )}
                        <Tooltip
                          content={
                            <>
                              {popWithDS
                                ? popWithDS.datasource.name
                                : t("source-open-climate")}
                              <br />
                              {t("population-year", {
                                year: population?.year,
                              })}
                            </>
                          }
                          positioning={{
                            placement: "bottom-start",
                          }}
                        >
                          <Icon
                            as={MdInfoOutline}
                            w={3}
                            h={3}
                            color="base.dark"
                          />
                        </Tooltip>
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="base.dark"
                        fontStyle="normal"
                        fontWeight={400}
                        lineHeight="20px"
                        letterSpacing="wide"
                      >
                        <Trans t={t}>total-population</Trans>
                      </Text>
                    </Box>
                  </Box>
                  {/* Area */}
                  <Box className="flex align-baseline gap-3">
                    <Icon
                      as={MdOutlineAspectRatio}
                      boxSize={6}
                      fill="base.dark"
                    />
                    <Box>
                      <Box className="flex gap-1">
                        {city.area === null || city.area! === 0 ? (
                          <Text
                            fontFamily="heading"
                            color="border.neutral"
                            fontSize="headline.sm"
                            fontWeight="semibold"
                            lineHeight="32"
                          >
                            {t("n-a")}
                          </Text>
                        ) : (
                          <Text
                            fontFamily="heading"
                            color="base.dark"
                            fontSize="headline.sm"
                            fontWeight="semibold"
                            lineHeight="32"
                          >
                            {Math.round(city.area!).toLocaleString()}
                            {/* eslint-disable-next-line i18next/no-literal-string */}
                            <span className="text-[16px]">
                              km<sup>2</sup>
                            </span>
                          </Text>
                        )}
                        <Tooltip
                          content={
                            <>
                              <Trans i18nKey="source-open-climate" t={t}>
                                {`Source: OpenClimate`}
                              </Trans>
                            </>
                          }
                          positioning={{
                            placement: "bottom-start",
                          }}
                        >
                          <Icon
                            as={MdInfoOutline}
                            w={3}
                            h={3}
                            color="base.dark"
                          />
                        </Tooltip>
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="base.dark"
                        fontStyle="normal"
                        fontWeight={400}
                        lineHeight="20px"
                        letterSpacing="wide"
                      >
                        <Trans t={t}>total-land-area</Trans>
                      </Text>
                    </Box>
                  </Box>
                </Grid>
                {/* --- END GRID LAYOUT --- */}
              </Box>
              <Box mt={-25}>
                <CityMap
                  locode={city?.locode ?? null}
                  width={422}
                  height={317}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  );
}

function ProjectTitle({
  city,
  t,
}: {
  city: CityWithProjectDataResponse;
  t: TFunction;
}) {
  return (
    <Text
      fontSize="title.md"
      w="max-content"
      fontWeight="semibold"
      color="base.dark"
      data-testid="hero-project-name"
    >
      {city?.project?.name === "cc_project_default"
        ? t("default-project")
        : city?.projectId}
    </Text>
  );
}
