"use client";

import { InventorySelect } from "@/components/InventorySelect";
import Footer from "@/components/Sections/Footer";
import { useTranslation } from "@/i18n/client";
import { api, useGetCityPopulationQuery } from "@/services/api";
import { CheckUserSession } from "@/util/check-user-session";
import {
  formatEmissions,
  getShortenNumberUnit,
  shortenNumber,
} from "@/util/helpers";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Icon,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CircleFlag } from "react-circle-flags";
import { Trans } from "react-i18next/TransWithoutContext";
import {
  MdArrowOutward,
  MdGroup,
  MdOutlineAddchart,
  MdOutlineAspectRatio,
} from "react-icons/md";
import MissingInventory from "@/components/missing-inventory";
import InventoryCalculationTab from "@/components/HomePage/InventoryCalculationTab";
import InventoryReportTab from "../../app/[lng]/[inventory]/InventoryResultTab";
import NotAvailable from "@/components/NotAvailable";
import DownloadButton from "@/components/HomePage/DownloadButton";

// only render map on the client
const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

export default function HomePage({
  lng,
  isPublic,
}: {
  lng: string;
  isPublic: boolean;
}) {
  const { t } = useTranslation(lng, "dashboard");
  const router = useRouter();

  // Check if user is authenticated otherwise route to login page
  isPublic || CheckUserSession();
  const { inventory: inventoryParam } = useParams();
  let inventoryId = inventoryParam as string | null;
  if (inventoryId === "null" || inventoryId === "undefined") {
    inventoryId = null;
  }

  // query API data
  // TODO maybe rework this logic into one RTK query:
  // https://redux-toolkit.js.org/rtk-query/usage/customizing-queries#performing-multiple-requests-with-a-single-query

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  let defaultInventoryId: string | null = null;
  if (!isUserInfoLoading && userInfo) {
    defaultInventoryId = userInfo.defaultInventoryId;

    // TODO also add this to login logic or after email verification to prevent extra redirect?
    // if the user doesn't have a default inventory or if path has a null inventory id, redirect to onboarding page
    if (!inventoryId) {
      if (defaultInventoryId) {
        inventoryId = defaultInventoryId;
        // fix inventoryId in URL without reloading page
        const newPath = "/" + lng + "/" + inventoryId;
        history.replaceState(null, "", newPath);
      } else {
        // fixes warning "Cannot update a component (`Router`) while rendering a different component (`Home`)"
        setTimeout(() => router.push(`/onboarding`), 0);
      }
    }
  }

  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery(inventoryId!, {
      skip: !inventoryId,
    });
  const { data: inventoryProgress, isLoading: isInventoryProgressLoading } =
    api.useGetInventoryProgressQuery(inventoryId!, {
      skip: !inventoryId,
    });

  const { data: city } = api.useGetCityQuery(inventory?.cityId!, {
    skip: !inventory?.cityId,
  });

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );

  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : { value: t("N/A"), unit: "" };

  return (
    <>
      {!inventory && !isInventoryLoading && (
        <>
          {isPublic ? (
            <NotAvailable lng={lng} />
          ) : (
            <MissingInventory lng={lng} />
          )}
          <Footer lng={lng} />
        </>
      )}
      {inventory && (
        <>
          <Box
            bg="brand.primary"
            className="w-full h-[491px] pt-[150px]"
            px={8}
          >
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
                      {!inventory ? <>{t("welcome")},</> : null}
                    </Text>
                    <Box className="flex items-center gap-4">
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
                            className="flex"
                          >
                            {inventory?.city?.name}
                          </Heading>
                          {!isPublic && (
                            <InventorySelect currentInventoryId={inventoryId} />
                          )}
                        </>
                      ) : (
                        (isUserInfoLoading || isInventoryLoading) && (
                          <Spinner size="lg" color="white" />
                        )
                      )}
                    </Box>
                    <Box className="flex gap-8 mt-[24px]">
                      <Box className="flex align-baseline gap-3">
                        <Icon
                          as={MdArrowOutward}
                          boxSize={6}
                          fill="interactive.accent"
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
                                {formattedEmissions.value}{" "}
                                <span className="text-[16px]">
                                  {formattedEmissions.unit}CO2e
                                </span>
                              </>
                            </Text>
                            <Tooltip
                              hasArrow
                              label={t("total-emissions-tooltip", {
                                year: inventory.year,
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
                            </Trans>{" "}
                          </Text>
                        </Box>
                      </Box>
                      <Box className="flex align-baseline gap-3">
                        <Icon
                          as={MdGroup}
                          boxSize={6}
                          fill="background.overlay"
                        />
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
                                    ? getShortenNumberUnit(
                                        population.population,
                                      )
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
                                N/A
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
                                {Math.round(
                                  inventory?.city.area!,
                                ).toLocaleString()}
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
                {!isPublic && (
                  <Box className="flex gap-[24px] relative justify-between top-[100px]">
                    <NextLink
                      data-testid={"add-data-to-inventory-card"}
                      href={`/${inventoryId}/data`}
                    >
                      <Card
                        shadow="2dp"
                        backgroundColor="base.light"
                        borderColor="interactive.accent"
                        borderWidth="thin"
                        className="h-[132px] hover:shadow-xl"
                        py={0}
                        px={6}
                      >
                        <Box className="flex items-center w-fill">
                          <Box>
                            <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#008600]">
                              <MdOutlineAddchart
                                className="text-white"
                                size={24}
                              />
                            </Box>
                          </Box>
                          <Box>
                            <CardHeader className="flex h-[20px] gap-2">
                              <Text
                                fontFamily="heading"
                                fontSize="title.lg"
                                color="interactive.primary"
                                fontWeight="semibold"
                              >
                                <Trans t={t}>add-data-to-inventory</Trans>
                              </Text>
                            </CardHeader>
                            <CardBody className="h-[75px]">
                              <Text
                                fontSize="body.lg"
                                color="body"
                                lineHeight="24"
                                letterSpacing="wide"
                              >
                                <Trans t={t}>
                                  add-data-to-inventory-description
                                </Trans>
                              </Text>
                            </CardBody>
                          </Box>
                        </Box>
                      </Card>
                    </NextLink>
                    <Box>
                      <DownloadButton
                        t={t}
                        lng={lng}
                        inventoryId={inventoryId!}
                        city={city}
                        inventory={inventory}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
          <Box
            className="h-full pt-[128px] pb-[100px]"
            bg="background.backgroundLight"
            px={8}
          >
            <Box className="flex mx-auto max-w-full w-[1090px] css-0">
              {!isPublic ? (
                <Tabs align="start" variant="line" isLazy>
                  <TabList>
                    {[
                      t("tab-emission-inventory-calculation-title"),
                      t("tab-emission-inventory-results-title"),
                    ]?.map((tab, index) => (
                      <Tab key={index}>
                        <Text
                          fontFamily="heading"
                          fontSize="title.md"
                          fontWeight="medium"
                        >
                          {t(tab)}
                        </Text>
                      </Tab>
                    ))}
                  </TabList>
                  <TabPanels>
                    <TabPanel>
                      <InventoryCalculationTab
                        lng={lng}
                        inventory={inventory}
                        inventoryProgress={inventoryProgress}
                        isUserInfoLoading={isUserInfoLoading}
                        isInventoryProgressLoading={isInventoryProgressLoading}
                      />
                    </TabPanel>
                    <TabPanel>
                      <InventoryReportTab
                        isPublic={isPublic}
                        lng={lng}
                        population={population}
                        inventory={inventory}
                        inventoryProgress={inventoryProgress}
                        isUserInfoLoading={isUserInfoLoading}
                        isInventoryProgressLoading={isInventoryProgressLoading}
                      />
                    </TabPanel>
                  </TabPanels>
                </Tabs>
              ) : (
                <InventoryReportTab
                  lng={lng}
                  population={population}
                  inventory={inventory}
                  inventoryProgress={inventoryProgress}
                  isUserInfoLoading={isUserInfoLoading}
                  isInventoryProgressLoading={isInventoryProgressLoading}
                  isPublic={isPublic}
                />
              )}
            </Box>
          </Box>
          <Footer lng={lng} />
        </>
      )}
    </>
  );
}
