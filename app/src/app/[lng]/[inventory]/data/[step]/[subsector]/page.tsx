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
  Tab,
  TabList,
  TabPanels,
  Tabs,
  Text,
} from "@chakra-ui/react";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MdOutlineHomeWork } from "react-icons/md";
import {
  AnimatePresence,
  easeInOut,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";

const MotionBox = motion(Box);

const kebab = (str: string|undefined): string =>
  (str)
    ? str.replaceAll(/\s+/g, '-').replaceAll(/[^0-9A-Za-z\-\_]/g, '').toLowerCase()
    : '';

function SubSectorPage({
  params: { lng, step, inventory: inventoryId, subsector },
}: {
  params: { lng: string; step: string; inventory: string; subsector: string };
}) {
  const router = useRouter();
  const { t } = useTranslation(lng, "data");
  const { scrollY } = useScroll();

  const paddingTop = useTransform(scrollY, [0, 100], ["100px", "50px"], {
    ease: easeInOut,
  });

  const fontSize = useTransform(scrollY, [0, 100], ["28px", "24px"], {
    ease: easeInOut,
    clamp: true,
  });
  const leftPosition = useTransform(scrollY, [0, 100], ["0px", "30px"], {
    ease: easeInOut,
  });

  const [isVisible, setIsVisible] = useState(true);

  const scrollStart = 0;
  const scrollEnd = 200;
  const animationPercent = useTransform(
    scrollY,
    [scrollStart, scrollEnd],
    [0, 100],
    {
      clamp: true, // Ensure the output stays within [0, 100]
    },
  );

  useMotionValueEvent(animationPercent, "change", (latest) => {
    setIsVisible(latest < 50);
  });

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
    <Tabs>
      <MotionBox
        bg="background.backgroundLight"
        className="fixed z-10 top-0 w-full transition-all"
        style={{
          paddingTop: paddingTop,
        }}
        borderColor="border.neutral"
        borderBottomWidth={true ? "1px" : ""}
      >
        <MotionBox className="w-[1090px] max-w-full mx-auto px-4">
          <AnimatePresence>
            {isVisible && (
              <MotionBox
                key="bread-crumb"
                w="full"
                display="flex"
                alignItems="center"
                gap="16px"
                initial="collapsed"
                animate="open"
                exit="collapsed"
                variants={{
                  open: { opacity: 1, height: "auto", marginBottom: "64px" },
                  collapsed: { opacity: 0, height: 0, marginBottom: 0 },
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Button
                  variant="ghost"
                  fontSize="14px"
                  leftIcon={<ArrowBackIcon boxSize={6} />}
                  onClick={() => router.back()}
                >
                  {t("go-back")}
                </Button>
                <Box
                  borderRightWidth="1px"
                  borderColor="border.neutral"
                  h="24px"
                />
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
                            t(kebab(subSectorData?.subsectorName))
                          )}
                        </Text>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </Breadcrumb>
                </Box>
              </MotionBox>
            )}
          </AnimatePresence>
          <MotionBox display="flex" gap="16px">
            <AnimatePresence mode="popLayout">
              {!isVisible && (
                <MotionBox
                  layout
                  w="full"
                  key="back-arrow"
                  initial="collapsed"
                  animate="open"
                  exit="collapsed"
                  variants={{
                    open: { opacity: 1, width: "24px" },
                    collapsed: { opacity: 0, width: 0 },
                  }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <Link href={`/${inventoryId}/data/${step}`}>
                    <Icon
                      as={ArrowBackIcon}
                      h="24px"
                      w="24px"
                      mt="24px"
                      color="content.link"
                    />
                  </Link>
                </MotionBox>
              )}
              <MotionBox
                layout
                key="icon"
                color="content.link"
                flexGrow={0}
                width="32px"
                pt="5px"
                pos="relative"
                style={{
                  left: leftPosition.get(),
                }}
              >
                <MdOutlineHomeWork size="32px" />
              </MotionBox>
              <MotionBox
                layout
                key="text-section"
                display="flex"
                flexGrow={1}
                gap="16px"
                flexDirection="column"
              >
                <Text
                  fontFamily="heading"
                  fontWeight="bold"
                  pos="relative"
                  style={{
                    left: leftPosition.get(),
                    fontSize: fontSize.get(),
                  }}
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
                    t(kebab(subSectorData?.subsectorName))
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
                  style={{
                    left: leftPosition.get(),
                  }}
                >
                  {t("sector")}: {getSectorName(step)} | {t("inventory-year")}:{" "}
                  {/*            {inventoryProgress?.inventory.year}*/}
                </Text>
                <AnimatePresence key="description-layout">
                  {isVisible && (
                    <MotionBox
                      key="description-text"
                      w="full"
                      display="flex"
                      alignItems="center"
                      gap="16px"
                      initial="collapsed"
                      animate="open"
                      exit="collapsed"
                      variants={{
                        open: { opacity: 1, height: "auto" },
                        collapsed: { opacity: 0, height: 0 },
                      }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <Text
                        letterSpacing="wide"
                        fontSize="body.lg"
                        fontWeight="normal"
                        color="interactive.control"
                      >
                        {t("commercial-and-institutional-building-description")}
                      </Text>
                    </MotionBox>
                  )}
                </AnimatePresence>
              </MotionBox>
            </AnimatePresence>
          </MotionBox>
        </MotionBox>
        <Box className="w-[1090px] max-w-full mx-auto px-4">
          <MotionTabList
            className="w-[1090px] z-10"
            layout
            bg="background.backgroundLight"
            borderBottomWidth="0px"
            h="80px"
          >
            {scopes?.map((scope, index) => (
              <Tab
                key={index}
                onClick={() => {
                  triggerMochLoading();
                }}
                className="[&[aria-selected='false']]:border-[transparent]"
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
        </Box>
      </MotionBox>
      <div className="pt-16 pb-16 w-[1090px] max-w-full mx-auto px-4 pb-[100px] mt-[240px]">
        <Box mt="48px">
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
        </Box>
      </div>
    </Tabs>
  );
}

export default SubSectorPage;
