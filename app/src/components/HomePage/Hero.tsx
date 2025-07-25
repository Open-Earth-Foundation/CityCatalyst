// only render map on the client
import dynamic from "next/dynamic";
import type { TFunction } from "i18next";
import type { PopulationAttributes } from "@/models/Population";
import type { InventoryResponse } from "@/util/types";
import { useGetOCCityDataQuery } from "@/services/api";
import { useMemo } from "react";
import { Box, Heading, Icon, Spinner, Text } from "@chakra-ui/react";
import { CircleFlag } from "react-circle-flags";
import {
  MdArrowOutward,
  MdGroup,
  MdInfoOutline,
  MdOutlineAspectRatio,
} from "react-icons/md";
import { Tooltip } from "@/components/ui/tooltip";
import { Trans } from "react-i18next/TransWithoutContext";
import { getShortenNumberUnit, shortenNumber } from "@/util/helpers";
import Link from "next/link";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

interface HeroProps {
  inventory: InventoryResponse;
  isPublic: boolean;
  currentInventoryId: string | null;
  isInventoryLoading: boolean;
  formattedEmissions: { value: string; unit: string };
  t: TFunction;
  population?: PopulationAttributes;
}

export function Hero({
  currentInventoryId,
  formattedEmissions: { unit, value },
  inventory,
  isInventoryLoading,
  isPublic,
  population,
  t,
}: HeroProps) {
  const { data: cityData } = useGetOCCityDataQuery(inventory.city?.locode!, {
    skip: !inventory.city?.locode,
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
    <Box bg="content.alternative" w="full" h="491px" pt="150px" px={8}>
      <Box display="flex" mx="auto" maxW="full" w="1090px">
        <Box
          w="full"
          h="240px"
          display="flex"
          flexDirection="column"
          justifyContent="center"
        >
          <Box display="flex" h="240px">
            <Box
              display="flex"
              gap="24px"
              flexDirection="column"
              h="full"
              w="full"
            >
              <Text
                fontSize="headline.sm"
                color="background.overlay"
                lineHeight="32"
                fontWeight="semibold"
              >
                {!inventory ? t("welcome") : null}
              </Text>
              <Box display="flex" flexDirection="column" gap={2}>
                {!isPublic &&
                hasFeatureFlag(FeatureFlags.PROJECT_OVERVIEW_ENABLED) ? (
                  <Link
                    href={`/public/project/${inventory?.city?.project?.projectId}`}
                  >
                    <ProjectTitle inventory={inventory} t={t} />
                  </Link>
                ) : (
                  <ProjectTitle inventory={inventory} t={t} />
                )}
                <Box display="flex" alignItems="center" gap={4}>
                  {inventory?.city ? (
                    <>
                      <CircleFlag
                        countryCode={
                          inventory.city.locode
                            ?.substring(0, 2)
                            .toLowerCase() || ""
                        }
                        width={32}
                      />
                      <Heading
                        fontSize="display.md"
                        color="base.light"
                        fontWeight="semibold"
                        lineHeight="52"
                        display="flex"
                      >
                        <span data-testid="hero-city-name">
                          {inventory?.city?.name}
                        </span>
                      </Heading>
                    </>
                  ) : (
                    isInventoryLoading && <Spinner size="lg" color="white" />
                  )}
                </Box>
              </Box>
              <Box display="flex" gap={8} mt="24px">
                <Box display="flex" alignItems="baseline" gap={3}>
                  <Icon
                    as={MdArrowOutward}
                    boxSize={6}
                    fill="sentiment.negativeDefault"
                  />
                  <Box>
                    <Box display="flex" gap={1}>
                      <Text
                        fontFamily="heading"
                        color="base.light"
                        fontSize="headline.sm"
                        fontWeight="semibold"
                        lineHeight="32"
                      >
                        <>
                          {value}{" "}
                          {/* eslint-disable-next-line i18next/no-literal-string */}
                          <span style={{ fontSize: "16px" }}>{unit}CO2e</span>
                        </>
                      </Text>
                      <Tooltip
                        content={t("total-emissions-tooltip", {
                          year: inventory?.year,
                        })}
                        positioning={{ placement: "bottom-start" }}
                      >
                        <Icon
                          as={MdInfoOutline}
                          w={3}
                          h={3}
                          color="background.overlay"
                        />
                      </Tooltip>
                    </Box>
                    <Text
                      fontSize="body.md"
                      color="background.overlay"
                      fontStyle="normal"
                      fontWeight={400}
                      lineHeight="20px"
                      letterSpacing="wide"
                    >
                      <Trans values={{ year: inventory?.year }} t={t}>
                        total-emissions-in
                      </Trans>
                    </Text>
                  </Box>
                </Box>
                <Box display="flex" alignItems="baseline" gap={3}>
                  <Icon as={MdGroup} boxSize={6} fill="background.overlay" />
                  <Box>
                    <Box display="flex" gap={1}>
                      {population?.population ? (
                        <Text
                          fontFamily="heading"
                          color="base.light"
                          fontSize="headline.sm"
                          fontWeight="semibold"
                          lineHeight="32"
                        >
                          {shortenNumber(population.population)}
                          <Text as="span" fontSize="16px">
                            {population?.population
                              ? getShortenNumberUnit(population.population)
                              : ""}
                          </Text>
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
                          color="background.overlay"
                        />
                      </Tooltip>
                    </Box>
                    <Text
                      fontSize="body.md"
                      color="background.overlay"
                      fontStyle="normal"
                      fontWeight={400}
                      lineHeight="20px"
                      letterSpacing="wide"
                    >
                      <Trans t={t}>total-population</Trans>
                    </Text>
                  </Box>
                </Box>
                <Box display="flex" alignItems="baseline" gap={3}>
                  <Icon
                    as={MdOutlineAspectRatio}
                    boxSize={6}
                    fill="background.overlay"
                  />
                  <Box>
                    <Box display="flex" gap={1}>
                      {inventory?.city.area === null ||
                      inventory?.city.area! === 0 ? (
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
                          color="base.light"
                          fontSize="headline.sm"
                          fontWeight="semibold"
                          lineHeight="32"
                        >
                          {Math.round(inventory?.city.area!).toLocaleString()}
                          {/* eslint-disable-next-line i18next/no-literal-string */}
                          <Text as="span" fontSize="16px">
                            km<sup>2</sup>
                          </Text>
                        </Text>
                      )}
                      <Tooltip
                        content={
                          <Trans i18nKey="source-open-climate" t={t}>
                            {`Source: OpenClimate`}
                          </Trans>
                        }
                        positioning={{
                          placement: "bottom-start",
                        }}
                      >
                        <Icon
                          as={MdInfoOutline}
                          w={3}
                          h={3}
                          color="background.overlay"
                        />
                      </Tooltip>
                    </Box>
                    <Text
                      fontSize="body.md"
                      color="background.overlay"
                      fontStyle="normal"
                      fontWeight={400}
                      lineHeight="20px"
                      letterSpacing="wide"
                    >
                      <Trans t={t}>total-land-area</Trans>
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Box>
            <Box mt={-25}>
              <CityMap
                locode={inventory?.city?.locode ?? null}
                width={422}
                height={317}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function ProjectTitle({
  inventory,
  t,
}: {
  inventory: InventoryResponse;
  t: TFunction;
}) {
  return (
    <Text
      fontSize="title.md"
      w="max-content"
      fontWeight="semibold"
      color="white"
      data-testid="hero-project-name"
    >
      {inventory?.city?.project?.name === "cc_project_default"
        ? t("default-project")
        : inventory?.city?.project?.name}
    </Text>
  );
}
