"use client";

import ActivityTab from "@/components/Tabs/Activity/activity-tab";
import LoadingState from "@/components/loading-state";
import { useTranslation } from "@/i18n/client";
import { RootState } from "@/lib/store";
import { api } from "@/services/api";
import { ArrowBackIcon, ChevronRightIcon } from "@chakra-ui/icons";
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
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
import { useSelector } from "react-redux";

function SubSectorPage({
  params: { lng, step, inventory: inventoryId, subsector },
}: {
  params: { lng: string; step: string; inventory: string; subsector: string };
}) {
  const router = useRouter();
  const { t } = useTranslation(lng, "data");

  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery(inventoryId);

  const {
    isOpen: isDeleteActivitiesModalOpen,
    onOpen: onDeleteActivitiesModalOpen,
    onClose: onDeleteActivitiesModalClose,
  } = useDisclosure();

  const [selectedTab, setSelectedTab] = useState(1); // sector ID (1/2/3)
  const [selectedScope, setSelectedScope] = useState(1);

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
  const { subsector: subsectorData, scopes } = useSelector(
    (state: RootState) => state.subsector,
  );

  // calculate total consumption and emissions

  const [scrollPosition, setScrollPosition] = useState<number>(0);

  const handleScroll = () => {
    const position = window.scrollY;
    setScrollPosition(position);
  };

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const MotionBox = motion(Box);
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

  return (
    <>
      <Box id="top" />
      <MotionBox
        bg="background.backgroundLight"
        className="fixed z-10 top-0 w-full pt-[180px] h-[400px]"
        mt={scrollPosition > 0 ? "-230px" : ""}
        animate={{
          y: scrollPosition > 0 ? 0 : -50,
        }}
        transition={{ duration: 0.2 }}
      >
        <Box className=" w-[1090px] max-w-full mx-auto px-4">
          <Box w="full" display="flex" alignItems="center" gap="16px" mb="64px">
            <Button
              variant="ghost"
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
                    href={`/${inventory}/data`}
                    color="content.tertiary"
                  >
                    {t("all-sectors")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={`/${inventory}/data/${step}`}
                    color="content.tertiary"
                  >
                    {getSectorName(step)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#" color="content.link">
                    <Text noOfLines={1}>{subsectorData?.subsectorName}</Text>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </Breadcrumb>
            </Box>
          </Box>
          <Box display="flex">
            {scrollPosition > 0 ? (
              <Box>
                <Link href={`/${inventory}/data`}>
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
                pt="3"
                pos="relative"
                left={scrollPosition > 0 ? "30px" : ""}
              >
                <MdOutlineHomeWork size="32px" />
              </Box>
              <Box
                display="flex"
                gap={scrollPosition > 0 ? "8px" : "16px"}
                flexDirection="column"
              >
                <Text
                  fontFamily="heading"
                  fontSize="headline.md"
                  fontWeight="bold"
                  pos="relative"
                  left={scrollPosition > 0 ? "30px" : ""}
                >
                  {subsectorData?.referenceNumber +
                    " " +
                    subsectorData?.subsectorName}
                </Text>
                <Text
                  fontFamily="heading"
                  letterSpacing="wide"
                  fontSize="label.lg"
                  fontWeight="medium"
                  pos="relative"
                  left={scrollPosition > 0 ? "30px" : ""}
                >
                  {t("sector")}: {t("stationary-energy")} |{" "}
                  {t("inventory-year")}: 2023
                </Text>
                {scrollPosition > 0 ? (
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
      </MotionBox>
      <div className="pt-16 pb-16 w-[1090px] max-w-full mx-auto px-4 mt-[240px]">
        <Box mt="48px">
          <Tabs>
            <MotionTabList
              className="w-[1090px] z-10"
              bg="background.backgroundLight"
              h="80px"
              pos={scrollPosition > 0 ? "fixed" : "relative"}
              top={scrollPosition > 0 ? "170px" : "50px"}
              animate={{
                y: scrollPosition > 0 ? 0 : -50,
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
              {isLoading ? (
                <LoadingState />
              ) : (
                scopes?.map((scope) => (
                  <ActivityTab
                    key={scope.scope}
                    filteredScope={scope}
                    t={t}
                    inventoryId={inventoryId}
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
