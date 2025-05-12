"use client";

import ActivityTab from "@/components/Tabs/Activity/activity-tab";
import LoadingState from "@/components/loading-state";
import { useTranslation } from "@/i18n/client";
import { SubSectorAttributes } from "@/models/SubSector";
import { api, useGetInventoryValuesBySubsectorQuery } from "@/services/api";
import { MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";
import {
  Box,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  Icon,
  Spinner,
  Tabs,
  TabsList,
  Text,
} from "@chakra-ui/react";

import { useRouter, useSearchParams } from "next/navigation";
import { forwardRef, useEffect, useState } from "react";
import { MdArrowBack, MdChevronRight, MdOutlineHomeWork } from "react-icons/md";
import {
  AnimatePresence,
  easeInOut,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import type { InventoryValueAttributes } from "@/models/InventoryValue";
import { getScopesForInventoryAndSector, SECTORS } from "@/util/constants";
import { toKebabCase } from "@/util/helpers";
import {
  BreadcrumbCurrentLink,
  BreadcrumbRoot,
} from "@/components/ui/breadcrumb";

const MotionBox = motion.create(
  // the display name is added below, but the linter isn't picking it up
  // eslint-disable-next-line react/display-name
  forwardRef<HTMLDivElement, any>((props, ref) => <Box ref={ref} {...props} />),
);
MotionBox.displayName = "MotionBox";

const kebab = (str: string | undefined): string =>
  str
    ? str
        .replaceAll(/\s+/g, "-")
        .replaceAll(/[^0-9A-Za-z\-\_]/g, "")
        .toLowerCase()
    : "";

function SubSectorPage({
  params: { lng, step, inventory: inventoryId, subsector },
}: {
  params: { lng: string; step: string; inventory: string; subsector: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const { data: inventoryData } = api.useGetInventoryQuery(inventoryId);

  const { data: inventoryProgress, isLoading: isInventoryProgressLoading } =
    api.useGetInventoryProgressQuery(defaultInventoryId!, {
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
      case "4":
        return t("IV");
      case "5":
        return t("V");

      default:
        return t("I");
    }
  };

  const sectorData = inventoryProgress?.sectorProgress.find(
    (sector) => sector.sector.referenceNumber === getSectorRefNo(step),
  );
  const subSectorData: SubSectorAttributes | undefined =
    sectorData?.subSectors.find(
      (subSectorItem) => subSectorItem.subsectorId === subsector,
    );
  const getSectorName = (currentStep: string) => {
    return SECTORS[parseInt(currentStep) - 1].name;
  };

  const getFilteredSubsectorScopes = () => {
    if (!inventoryData) return [];
    return Object.entries(MANUAL_INPUT_HIERARCHY)
      .filter(([key]) => key.startsWith(subSectorData?.referenceNumber!))
      .map(([k, v]) => ({ ...v, referenceNumber: k }))
      .filter((scope) => {
        return getScopesForInventoryAndSector(
          inventoryData.inventoryType!,
          scope.referenceNumber.split(".")[0],
        ).includes(scope.scope);
      });
  };
  const scopes = getFilteredSubsectorScopes();

  const MotionTabList = motion.create(
    // the display name is added below, but the linter isn't picking it up
    // eslint-disable-next-line react/display-name
    forwardRef<HTMLDivElement, any>((props, ref) => (
      <TabsList ref={ref} {...props} />
    )),
  );
  MotionTabList.displayName = "MotionTabList";

  const subSectorId = subSectorData?.subsectorId;

  const { data: activityData, isLoading: isActivityDataLoading } =
    api.useGetActivityValuesQuery(
      { inventoryId, subSectorId },
      { skip: !subSectorId }, // request fails without a subSectorId
    );

  // fetch the inventoryValue for the selected scope
  const { data: inventoryValues, isLoading: isInventoryValueLoading } =
    useGetInventoryValuesBySubsectorQuery(
      {
        inventoryId,
        subSectorId: subSectorId ?? "",
      },
      { skip: !subSectorId },
    );
  const getFilteredInventoryValues = (
    referenceNumber: string,
  ): InventoryValueAttributes[] => {
    return (
      (inventoryValues as InventoryValueAttributes[] | undefined)?.filter(
        (iv) => iv.gpcReferenceNumber === referenceNumber,
      ) ?? []
    );
  };

  const loadingState =
    isActivityDataLoading ||
    isInventoryValueLoading ||
    isInventoryProgressLoading ||
    isUserInfoLoading;

  return (
    <Tabs.Root defaultValue="0">
      <MotionBox
        bg="background.backgroundLight"
        className="fixed z-10 top-0 w-full transition-all"
        style={{
          paddingTop: paddingTop,
        }}
        borderColor="border.neutral"
        borderBottomWidth="1px"
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
                  color="content.link"
                  onClick={() => router.back()}
                >
                  <Icon as={MdArrowBack} boxSize={6} />
                  {t("go-back")}
                </Button>
                <Box
                  borderRightWidth="1px"
                  borderColor="border.neutral"
                  h="24px"
                />
                <Box>
                  <BreadcrumbRoot
                    gap="8px"
                    fontFamily="heading"
                    fontWeight="bold"
                    letterSpacing="widest"
                    fontSize="14px"
                    textTransform="uppercase"
                    separator={
                      <Icon as={MdChevronRight} color="gray.500" h="24px" />
                    }
                  >
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        href={`/${inventoryId}/data`}
                        color="content.tertiary"
                        truncate
                      >
                        {t("all-sectors")}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        href={`/${inventoryId}/data/${step}`}
                        color="content.tertiary"
                        truncate
                      >
                        {t(getSectorName(step))}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbCurrentLink
                      color="content.link"
                      textDecoration="underline"
                    >
                      <Text truncate lineClamp={1}>
                        {!subSectorData ? (
                          <Spinner size="xs" />
                        ) : (
                          t(kebab(subSectorData?.subsectorName))
                        )}
                      </Text>
                    </BreadcrumbCurrentLink>
                  </BreadcrumbRoot>
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
                      as={MdArrowBack}
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
                    <Spinner size="xs" />
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
                  {t("sector")}: {t(getSectorName(step))} |{" "}
                  {t("inventory-year")}: {inventoryProgress?.inventory.year}
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
                        {t(
                          toKebabCase(subSectorData?.subsectorName) +
                            "-description",
                        )}
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
              <Tabs.Trigger
                key={index}
                className="[&[aria-selected='false']]:border-[transparent]"
                value={index.toString()}
                mt="40px"
              >
                <Text
                  fontFamily="heading"
                  fontSize="title.md"
                  fontWeight="medium"
                >
                  {t("scope")} {scope.scope}
                </Text>
              </Tabs.Trigger>
            ))}
          </MotionTabList>
        </Box>
      </MotionBox>
      <div className="pt-16 w-[1090px] max-w-full mx-auto px-4 pb-[100px] mt-[240px]">
        <Box mt="48px">
          {loadingState ? (
            <LoadingState />
          ) : (
            scopes?.map((scope, index) => {
              return (
                <Tabs.Content
                  key={index}
                  value={index.toString()}
                  p="0"
                  pt="48px"
                >
                  <ActivityTab
                    referenceNumber={scope.referenceNumber!}
                    key={scope.referenceNumber}
                    t={t}
                    inventoryId={inventoryId}
                    subsectorId={subsector}
                    step={step}
                    activityData={activityData}
                    inventoryValues={getFilteredInventoryValues(
                      scope.referenceNumber,
                    )}
                  />
                </Tabs.Content>
              );
            })
          )}
        </Box>
      </div>
    </Tabs.Root>
  );
}

export default SubSectorPage;
