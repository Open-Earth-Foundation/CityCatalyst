"use client";

import ActivityTab from "@/components/Tabs/Activity/activity-tab";
import LoadingState from "@/components/loading-state";
import { useTranslation } from "@/i18n/client";
import { SubSectorAttributes } from "@/models/SubSector";
import { api, useGetInventoryValuesBySubsectorQuery } from "@/services/api";
import { MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";
import { ArrowBackIcon, ChevronRightIcon } from "@chakra-ui/icons";
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  CircularProgress,
  Icon,
  Link,
  Tab,
  TabList,
  TabPanels,
  Tabs,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MdOutlineHomeWork } from "react-icons/md";
import { toKebabCase } from "@/util/helpers";
import { throttle } from "lodash";

function SubSectorPage({
  params: { lng, step, inventory: inventoryId, subsector },
}: {
  params: { lng: string; step: string; inventory: string; subsector: string };
}) {
  const router = useRouter();
  const { t } = useTranslation(lng, "data");

  const {
    isOpen: isDeleteActivitiesModalOpen,
    onOpen: onDeleteActivitiesModalOpen,
    onClose: onDeleteActivitiesModalClose,
  } = useDisclosure();

  const [selectedTab, setSelectedTab] = useState(1); // sector ID (1/2/3)
  const [selectedScope, setSelectedScope] = useState(1);
  const [refNumber, setRefNumber] = useState();
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  const defaultInventoryId = userInfo?.defaultInventoryId;

  const {
    data: inventoryProgress,
    isLoading: isInventoryProgressLoading,
    error: inventoryProgressError,
  } = api.useGetInventoryProgressQuery(defaultInventoryId!, {
    skip: !defaultInventoryId,
  });

  // map subsector to sector by reference number

  const getSectorRefNo = (currentStep: string) => {
    switch (currentStep) {
      case "1":
        return t("I");
      case "2":
        return t("II");
      case "3":
        return t("III");
      default:
        return t("I");
    }
  };

  const sectorData = inventoryProgress?.sectorProgress.find(
    (sector) => sector.sector.referenceNumber === getSectorRefNo(step),
  );

  const subSectorData: SubSectorAttributes = sectorData?.subSectors.find(
    (subsectorItem) => subsectorItem.subsectorId === subsector,
  );
  const getSectorName = (currentStep: string) => {
    switch (currentStep) {
      case "1":
        return t("stationary-energy");
      case "2":
        return t("transportation");
      case "3":
        return t("waste");
      default:
        return t("stationary-energy");
    }
  };

  const getFilteredSubsectorScopes = () => {
    const scopes = [];

    for (const key in MANUAL_INPUT_HIERARCHY) {
      if (key.startsWith(subSectorData?.referenceNumber!)) {
        const scopeNumber = key.split(".").pop();
        const result = {
          ...MANUAL_INPUT_HIERARCHY[key],
          scope: Number(scopeNumber),
        };
        scopes.push(result);
      }
    }
    return scopes;
  };

  const scopes = getFilteredSubsectorScopes();

  // calculate total consumption and emissions

  const [scrollPosition, setScrollPosition] = useState<number>(0);

  const handleScroll = () => {
    const position = window.scrollY;

    setIsExpanded(window.scrollY > scrollResizeHeaderThreshold);
    // setScrollPosition(position);
  };

  useEffect(() => {
    const throttledHandle = throttle(handleScroll, 500);
    window.addEventListener("scroll", throttledHandle, { passive: true });

    return () => {
      window.removeEventListener("scroll", throttledHandle);
    };
  }, []);

  const MotionTabList = motion(TabList);

  const [isLoading, setIsLoading] = useState(false);

  const triggerMochLoading = () => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  };
  const scrollResizeHeaderThreshold = 170;
  const [isExpanded, setIsExpanded] = useState(false);

  // const throtthledFunc = useCallback(throttle( => {
  //   console.log("throttled");
  //   if (scrollPosition > scrollResizeHeaderThreshold) {
  //     setIsExpanded(true);
  //   } else {
  //     setIsExpanded(false);
  //   }
  // }, 2500), []);

  // useEffect(() => {
  //   throtthledFunc();
  // }, [scrollPosition]);

  // const isExpanded = scrollPosition > scrollResizeHeaderThreshold;

  console.log("scroll position", scrollPosition);

  const { data: activityData, isLoading: isActivityDataLoading } =
    api.useGetActivityValuesQuery({
      inventoryId,
      subSectorId: subSectorData?.subsectorId,
    });

  // fetch the inventoryValue for the selected scope
  const { data: inventoryValues, isLoading: isInventoryValueLoading } =
    useGetInventoryValuesBySubsectorQuery({
      inventoryId,
      subSectorId: subSectorData?.subsectorId,
    });

  const loadingState =
    isActivityDataLoading || isInventoryValueLoading || isLoading;

  return (
    <>
      <Box
        bg="background.backgroundLight"
        className={`fixed z-10 top-0 w-full ${isExpanded ? "pt-[50px] h-[200px]" : "pt-[100px] h-[400px]"} transition-all duration-50 ease-linear`}
      >
        <Box className=" w-[1090px]  max-w-full mx-auto px-4">
          <Box
            w="full"
            display="flex"
            alignItems="center"
            gap="16px"
            mb="64px"
            className={` ${isExpanded ? "hidden" : "flex"} transition-all duration-50 ease-linear`}
          >
            <Button
              variant="ghost"
              fontSize="14px"
              leftIcon={<ArrowBackIcon boxSize={6} />}
              onClick={() => router.back()}
            >
              {t("go-back")}
            </Button>
            <Box borderRightWidth="1px" borderColor="border.neutral" h="24px" />
            <Box>
              <Breadcrumb
                spacing="8px"
                fontFamily="heading"
                fontWeight="bold"
                fontSize="14px"
                letterSpacing="widest"
                textTransform="uppercase"
                separator={<ChevronRightIcon color="gray.500" h="24px" />}
              >
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={`/${inventoryId}/data`}
                    color="content.tertiary"
                  >
                    {t("all-sectors")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={`/${inventoryId}/data/${step}`}
                    color="content.tertiary"
                  >
                    {getSectorName(step)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#" color="content.link">
                    <Text noOfLines={1}>
                      {!subSectorData ? (
                        <CircularProgress
                          isIndeterminate
                          color="content.tertiary"
                          size={"30px"}
                        />
                      ) : (
                        t(toKebabCase(subSectorData?.subsectorName))
                      )}
                    </Text>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </Breadcrumb>
            </Box>
          </Box>
          <Box display="flex">
            {isExpanded ? (
              <Box>
                <Link href={`/${inventoryId}/data/${step}`}>
                  <Icon
                    as={ArrowBackIcon}
                    h="24px"
                    w="24px"
                    mt="24px"
                    color="content.link"
                  />
                </Link>
              </Box>
            ) : (
              ""
            )}
            <Box display="flex" gap="16px">
              <Box
                color="content.link"
                pt="5px"
                pos="relative"
                left={isExpanded ? "30px" : ""}
              >
                <MdOutlineHomeWork size="32px" />
              </Box>
              <Box
                display="flex"
                gap={isExpanded ? "8px" : "16px"}
                flexDirection="column"
              >
                <Text
                  fontFamily="heading"
                  fontSize={isExpanded ? "headline.sm" : "headline.md"}
                  fontWeight="bold"
                  pos="relative"
                  left={isExpanded ? "30px" : ""}
                  className="transition-all duration-50 ease-linear"
                >
                  {!subSectorData ? (
                    <CircularProgress
                      isIndeterminate
                      color="content.tertiary"
                      size={"30px"}
                    />
                  ) : subSectorData?.referenceNumber != undefined ? (
                    subSectorData?.referenceNumber +
                    " " +
                    t(toKebabCase(subSectorData?.subsectorName))
                  ) : (
                    ""
                  )}
                </Text>
                <Text
                  fontFamily="heading"
                  letterSpacing="wide"
                  fontSize="label.lg"
                  fontWeight="medium"
                  pos="relative"
                  left={isExpanded ? "-15px" : ""}
                >
                  {t("sector")}: {getSectorName(step)} | {t("inventory-year")}:{" "}
                  {inventoryProgress?.inventory.year}
                </Text>
                {isExpanded ? (
                  ""
                ) : (
                  <Text
                    letterSpacing="wide"
                    fontSize="body.lg"
                    fontWeight="normal"
                    color="interactive.control"
                  >
                    {t("commercial-and-institutional-building-description")}
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
      <div className="pt-16 pb-16 w-[1090px] max-w-full mx-auto px-4 pb-[100px] mt-[240px]">
        <Box mt="48px">
          <Tabs>
            <MotionTabList
              className="w-[1090px] z-10"
              bg="background.backgroundLight"
              h="80px"
              pos={isExpanded ? "fixed" : "relative"}
              top={isExpanded ? "170px" : "50px"}
              animate={{
                y: isExpanded ? 0 : -50,
                delay: 200,
              }}
              transition={{ duration: 0.2 }}
            >
              {scopes?.map((scope, index) => (
                <Tab
                  key={index}
                  onClick={() => {
                    setSelectedScope(scope.scope);
                    triggerMochLoading();
                  }}
                >
                  <Text
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="medium"
                  >
                    {t("scope")} {scope.scope}
                  </Text>
                </Tab>
              ))}
            </MotionTabList>

            <TabPanels>
              {loadingState ? (
                <LoadingState />
              ) : (
                scopes?.map((scope) => (
                  <ActivityTab
                    referenceNumber={subSectorData?.referenceNumber!}
                    key={subSectorData?.referenceNumber}
                    filteredScope={scope.scope}
                    t={t}
                    inventoryId={inventoryId}
                    subsectorId={subsector}
                    step={step}
                    activityData={activityData}
                    inventoryValues={inventoryValues ?? []}
                  />
                ))
              )}
            </TabPanels>
          </Tabs>
        </Box>
      </div>
    </>
  );
}

export default SubSectorPage;
