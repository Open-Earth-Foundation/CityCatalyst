// only render map on the client
import dynamic from "next/dynamic";
import { Box, Heading, Icon, Spinner, Text, Tooltip } from "@chakra-ui/react";
import { CircleFlag } from "react-circle-flags";
import { InventorySelect } from "@/components/InventorySelect";
import { MdArrowOutward, MdGroup, MdOutlineAspectRatio } from "react-icons/md";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Trans } from "react-i18next/TransWithoutContext";
import { getShortenNumberUnit, shortenNumber } from "@/util/helpers";
import type { TFunction } from "i18next";
import type { PopulationAttributes } from "@/models/Population";
import type { InventoryResponse } from "@/util/types";

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
  return (
    <Box bg="brand.primary" className="w-full h-[491px] pt-[150px]" px={8}>
      <Box className="flex mx-auto max-w-full w-[1090px]">
        <Box className="w-full h-[240px] flex flex-col justify-center">
          <Box className="flex h-[240px]">
            <Box className="flex gap-[24px] flex-col h-full w-full">
              <Text
                fontSize="headline.sm"
                color="background.overlay"
                lineHeight="32"
                fontWeight="semibold"
              >
                {!inventory ? <>{t("welcome")}</> : null}
              </Text>
              <Box className="flex items-center gap-4">
                {inventory?.city ? (
                  <>
                    <CircleFlag
                      countryCode={
                        inventory.city.locode?.substring(0, 2).toLowerCase() ||
                        ""
                      }
                      width={32}
                    />
                    <Heading
                      fontSize="display.md"
                      color="base.light"
                      fontWeight="semibold"
                      lineHeight="52"
                      className="flex"
                    >
                      {inventory?.city?.name}
                    </Heading>
                    {!isPublic && (
                      <InventorySelect
                        currentInventoryId={currentInventoryId}
                      />
                    )}
                  </>
                ) : (
                  isInventoryLoading && <Spinner size="lg" color="white" />
                )}
              </Box>
              <Box className="flex gap-8 mt-[24px]">
                <Box className="flex align-baseline gap-3">
                  <Icon
                    as={MdArrowOutward}
                    boxSize={6}
                    fill="sentiment.negativeDefault"
                  />
                  <Box>
                    <Box className="flex gap-1">
                      <Text
                        fontFamily="heading"
                        color="base.light"
                        fontSize="headline.sm"
                        fontWeight="semibold"
                        lineHeight="32"
                      >
                        <>
                          {value}{" "}
                          <span className="text-[16px]">{unit}CO2e</span>
                        </>
                      </Text>
                      <Tooltip
                        hasArrow
                        label={t("total-emissions-tooltip", {
                          year: inventory?.year,
                        })}
                        placement="bottom-start"
                      >
                        <InfoOutlineIcon
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
                <Box className="flex align-baseline gap-3">
                  <Icon as={MdGroup} boxSize={6} fill="background.overlay" />
                  <Box>
                    <Box className="flex gap-1">
                      {population?.population ? (
                        <Text
                          fontFamily="heading"
                          color="base.light"
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
                        hasArrow
                        label={
                          <>
                            <Trans i18nKey="source-open-climate" t={t}>
                              {`Source: OpenClimate`}
                            </Trans>
                            <br />
                            {t("population-year", {
                              year: population?.year,
                            })}
                          </>
                        }
                        placement="bottom-start"
                      >
                        <InfoOutlineIcon
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
                <Box className="flex align-baseline gap-3">
                  <Icon
                    as={MdOutlineAspectRatio}
                    boxSize={6}
                    fill="background.overlay"
                  />
                  <Box>
                    <Box className="flex gap-1">
                      {inventory?.city.area === null ||
                      inventory?.city.area! === 0 ? (
                        <Text
                          fontFamily="heading"
                          color="border.neutral"
                          fontSize="headline.sm"
                          fontWeight="semibold"
                          lineHeight="32"
                        >
                          N/A
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
                          <span className="text-[16px]">km2</span>
                        </Text>
                      )}
                      <Tooltip
                        hasArrow
                        label={
                          <>
                            <Trans i18nKey="source-open-climate" t={t}>
                              {`Source: OpenClimate`}
                            </Trans>
                          </>
                        }
                        placement="bottom-start"
                      >
                        <InfoOutlineIcon
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
