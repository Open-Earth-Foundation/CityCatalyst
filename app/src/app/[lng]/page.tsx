"use client";

import { SectorCard } from "@/components/Cards/SectorCard";
import ChatPopover from "@/components/ChatBot/chat-popover";
import { InventorySelect } from "@/components/InventorySelect";
import Footer from "@/components/Sections/Footer";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { CircleIcon } from "@/components/icons";
import { NavigationBar } from "@/components/navigation-bar";
import { useTranslation } from "@/i18n/client";
import { api, useGetCityPopulationQuery } from "@/services/api";
import {
  formatPercent,
  getShortenNumberUnit,
  shortenNumber,
} from "@/util/helpers";
import { SectorProgress } from "@/util/types";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Center,
  CloseButton,
  Heading,
  Icon,
  Link,
  Spacer,
  Spinner,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { CircleFlag } from "react-circle-flags";
import { Trans } from "react-i18next/TransWithoutContext";
import { FiDownload } from "react-icons/fi";
import {
  MdArrowOutward,
  MdCheckCircleOutline,
  MdGroup,
  MdOutlineAddchart,
  MdOutlineAspectRatio,
} from "react-icons/md";

enum STATUS {
  INFO = "info",
  SUCCESS = "success",
  ERROR = "error",
}

// only render map on the client
const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

function sortSectors(a: SectorProgress, b: SectorProgress): number {
  const refA = a.sector.referenceNumber;
  const refB = b.sector.referenceNumber;
  if (!refA || !refB) {
    return 0;
  } else if (refA < refB) {
    return -1;
  } else if (refA > refB) {
    return 1;
  }
  return 0;
}

export default function Home({ params: { lng } }: { params: { lng: string } }) {
  const { t } = useTranslation(lng, "dashboard");
  const toast = useToast();
  const router = useRouter();

  // query API data
  // TODO maybe rework this logic into one RTK query:
  // https://redux-toolkit.js.org/rtk-query/usage/customizing-queries#performing-multiple-requests-with-a-single-query
  let defaultInventoryId: string | null = null;
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  if (!isUserInfoLoading && userInfo) {
    defaultInventoryId = userInfo.defaultInventoryId;

    // TODO also add this to login logic or after email verification to prevent extra redirect?
    // if the user doesn't have a default inventory, redirect to onboarding page
    if (!defaultInventoryId) {
      // fixes warning "Cannot update a component (`Router`) while rendering a different component (`Home`)"
      setTimeout(() => router.push("/onboarding"), 0);
    }
  }
  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery(defaultInventoryId!, {
      skip: !defaultInventoryId,
    });

  const { data: inventoryProgress, isLoading: isInventoryProgressLoading } =
    api.useGetInventoryProgressQuery(defaultInventoryId!, {
      skip: !defaultInventoryId,
    });

  const { data: city } = api.useGetCityQuery(inventory?.cityId!, {
    skip: !inventory?.cityId,
  });

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );

  let totalProgress = 0,
    thirdPartyProgress = 0,
    uploadedProgress = 0;
  if (inventoryProgress && inventoryProgress.totalProgress.total > 0) {
    const { uploaded, thirdParty, total } = inventoryProgress.totalProgress;
    totalProgress = (uploaded + thirdParty) / total;
    thirdPartyProgress = thirdParty / total;
    uploadedProgress = uploaded / total;
  }

  const showToast = (
    title: string,
    description: string,
    status: any,
    duration: number | null,
    bgColor: string,
    showAnimatedGradient: boolean = false,
  ) => {
    // Replace previous toast notifications
    if (duration == null) {
      toast.closeAll();
    }

    const animatedGradientClass = `bg-gradient-to-l from-brand via-brand_light to-brand bg-[length:200%_auto] animate-gradient`;

    toast({
      description: t(description),
      status: status,
      duration: duration,
      isClosable: true,
      render: ({ onClose }) => (
        <Box
          display="flex"
          gap="8px"
          color="white"
          alignItems="center"
          p={3}
          bg={showAnimatedGradient ? undefined : bgColor}
          className={showAnimatedGradient ? animatedGradientClass : undefined}
          width="600px"
          height="60px"
          borderRadius="8px"
        >
          <Box display="flex" gap="8px" alignItems="center">
            {status === "info" || status === "error" ? (
              <InfoOutlineIcon fontSize="24px" />
            ) : (
              <MdCheckCircleOutline fontSize="24px" />
            )}
            <Text
              color="base.light"
              fontWeight="bold"
              lineHeight="52"
              fontSize="label.lg"
            >
              {t(title)}
            </Text>
          </Box>
          <Spacer />
          {status === "error" && (
            <Button
              variant="lightGhost"
              onClick={handleDownload}
              fontWeight="600"
              fontSize="16px"
              letterSpacing="1.25px"
            >
              {t("try-again")}
            </Button>
          )}
          <CloseButton onClick={onClose} />
        </Box >
      ),
    });
  };

  const handleDownload = () => {
    showToast(
      "preparing-dataset",
      "wait-fetch-data",
      STATUS.INFO,
      null,
      "semantic.info",
      true // animated gradient
    );
    const format = "xls";
    fetch(`/api/v0/inventory/${defaultInventoryId}?format=${format}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Network response was not ok");
        }

        const contentDisposition = res.headers.get("Content-Disposition");
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          const filename = match
            ? match[1]
            : `${city?.locode}_${inventory?.year}.${format}`;
          return res.blob().then((blob) => {
            const downloadLink = document.createElement("a");
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = filename;

            downloadLink.click();
            showToast(
              "download-complete",
              "downloading-data",
              STATUS.SUCCESS,
              null,
              "interactive.primary",
            );
            URL.revokeObjectURL(downloadLink.href);
            downloadLink.remove();
          });
        }
      })
      .catch((error) => {
        console.error("Download error:", error);
        showToast(
          "download-failed",
          "download-error",
          STATUS.ERROR,
          null,
          "semantic.danger",
        );
      });
  };

  return (
    <>
      <NavigationBar lng={lng} />
      <Box bg="brand.primary" className="w-full h-[491px] pt-[150px]" px={8}>
        <Box className="flex mx-auto max-w-full w-[1090px]">
          <Box className="w-full h-[240px] flex flex-col justify-center">
            <Box className="flex h-[240px]">
              <Box className="flex gap-[24px] flex-col h-full w-full">
                <Text
                  fontSize="headline.sm"
                  color="brandScheme.100"
                  lineHeight="32"
                  fontWeight="semibold"
                >
                  {inventory ? <>{t("welcome-back")},</> : <>{t("welcome")},</>}
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
                      <InventorySelect
                        currentInventoryId={defaultInventoryId}
                      />
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
                          {inventory?.totalEmissions ? (
                            <>
                              {inventory.totalEmissions}{" "}
                              <span className="text-[16px]">Mtco2e</span>
                            </>
                          ) : (
                            <>{t("in-progress")}</>
                          )}
                        </Text>
                        <InfoOutlineIcon w={3} h={3} color="brandScheme.100" />
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="brandScheme.100"
                        fontStyle="normal"
                        fontWeight={400}
                        lineHeight="20px"
                        letterSpacing="wide"
                      >
                        <Trans t={t}>total-emissions-in</Trans>{" "}
                        {inventory?.year}
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
                            N/A
                          </Text>
                        )}

                        <InfoOutlineIcon w={3} h={3} color="brandScheme.100" />
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="brandScheme.100"
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
                        {!city?.area ? (
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
                            {city?.area}
                            <span className="text-[16px]">km2</span>
                          </Text>
                        )}
                        <InfoOutlineIcon w={3} h={3} color="brandScheme.100" />
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="brandScheme.100"
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
            <Box className="flex gap-[24px] relative justify-between top-[100px]">
              <NextLink href="/data">
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
                        <MdOutlineAddchart className="text-white" size={24} />
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
                          <Trans t={t}>add-data-to-inventory-description</Trans>
                        </Text>
                      </CardBody>
                    </Box>
                  </Box>
                </Card>
              </NextLink>
              <Box>
                <Card
                  onClick={handleDownload}
                  shadow="2dp"
                  backgroundColor="base.light"
                  className="h-[132px] hover:shadow-xl"
                  py={0}
                  px={6}
                >
                  <Box className="flex items-center w-fill">
                    <Box>
                      <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#2351DC]">
                        <FiDownload className="text-white" size={24} />
                      </Box>
                    </Box>
                    <Box>
                      <CardHeader className="flex h-[20px] gap-2">
                        <Text
                          fontFamily="heading"
                          fontSize="title.lg"
                          color="interactive.secondary"
                          fontWeight="semibold"
                        >
                          <Trans t={t}>download</Trans>
                        </Text>
                      </CardHeader>
                      <CardBody className="h-[75px]">
                        <Text
                          fontSize="body.lg"
                          color="body"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          <Trans t={t}>download-description</Trans>
                        </Text>
                      </CardBody>
                    </Box>
                  </Box>
                </Card>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
      <Box
        className="h-full pt-[128px] pb-[100px]"
        bg="background.backgroundLight"
        px={8}
      >
        <Box className="flex mx-auto max-w-full w-[1090px]">
          <Box className="flex flex-col gap-[8px] w-full h-300">
            <Box className="flex items-center gap-3">
              <Heading
                fontSize="headline.sm"
                fontWeight="semibold"
                lineHeight="32"
              >
                <Trans t={t}>
                  gpc-basic-emissions-inventory-calculations-year
                </Trans>{" "}
                {inventory?.year}
              </Heading>
              <Tooltip
                hasArrow
                label={t("gpc-calculation")}
                placement="bottom-start"
              >
                <InfoOutlineIcon color="interactive.control" />
              </Tooltip>
            </Box>
            <Text
              fontWeight="regular"
              fontSize="body.lg"
              color="interactive.control"
              letterSpacing="wide"
            >
              <Trans
                i18nKey="gpc-inventory-description"
                values={{ year: inventory?.year }}
                t={t}
              >
                The data you have submitted is now officially incorporated into
                your city&apos;s {{ year: inventory?.year }} GHG Emissions Inventory,
                compiled according to the GPC Basic methodology.{" "}
                <Link
                  href="https://ghgprotocol.org/ghg-protocol-cities"
                  target="_blank"
                  fontWeight="bold"
                  color="brand.secondary"
                >
                  Learn more
                </Link>{" "}
                about GPC Protocol
              </Trans>
            </Text>
            <Box className="flex w-full justify-between items-center mt-2 gap-6">
              <SegmentedProgress
                values={[thirdPartyProgress, uploadedProgress]}
                colors={["interactive.connected", "interactive.tertiary"]}
              />
              <Heading
                fontWeight="semibold"
                fontSize="body.md"
                className="whitespace-nowrap"
              >
                {formatPercent(totalProgress)}% <Trans t={t}>completed</Trans>
              </Heading>
            </Box>
            <Box className="flex gap-4 mt-2">
              <Tag>
                <TagLeftIcon
                  as={CircleIcon}
                  boxSize={6}
                  color="interactive.connected"
                />
                <TagLabel>
                  {formatPercent(thirdPartyProgress)}%{" "}
                  <Trans t={t}>connect-third-party-data</Trans>
                </TagLabel>
              </Tag>
              <Tag>
                <TagLeftIcon
                  as={CircleIcon}
                  boxSize={6}
                  color="interactive.tertiary"
                />
                <TagLabel>
                  {formatPercent(uploadedProgress)}%{" "}
                  <Trans t={t}>uploaded-data</Trans>
                </TagLabel>
              </Tag>
            </Box>
            <Box className=" flex flex-col gap-[24px] py-[48px]">
              <Text
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="semibold"
                lineHeight="24"
              >
                <Trans t={t}>sectors-required-from-inventory</Trans>
              </Text>
              {isUserInfoLoading || isInventoryProgressLoading ? (
                <Center>
                  <Spinner size="lg" />
                </Center>
              ) : (
                inventoryProgress?.sectorProgress
                  .slice()
                  .filter((sectorProgress) => {
                    return ["I", "II", "III"].includes(
                      sectorProgress.sector.referenceNumber || "",
                    );
                  })
                  .sort(sortSectors)
                  .map((sectorProgress, i) => (
                    <SectorCard
                      key={i}
                      sectorProgress={sectorProgress}
                      stepNumber={i + 1}
                      t={t}
                    />
                  ))
              )}
            </Box>
          </Box>
        </Box>
      </Box>
      <Footer lng={lng} />
      <ChatPopover />
    </>
  );
}
