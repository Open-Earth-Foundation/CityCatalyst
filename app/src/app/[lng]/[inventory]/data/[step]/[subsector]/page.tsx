"use client";

import MethodologyCard from "@/components/Cards/methodology-card";
import SuggestedActivityCard from "@/components/Cards/suggested-activities-card";
import AddActivityModalEnergyConsumption from "@/components/Modals/add-activity-energy-consumption-modal";
import AddActivityModal from "@/components/Modals/add-activity-modal";
import ChangeMethodology from "@/components/Modals/change-methodology";
import DeleteActivityModal from "@/components/Modals/delete-activity-modal";
import DeleteAllActivitiesModal from "@/components/Modals/delete-all-activities-modal";
import ActivityTab from "@/components/Tabs/activity-tab";
import HeadingText from "@/components/heading-text";
import LoadingState from "@/components/loading-state";
import { useTranslation } from "@/i18n/client";
import { RootState } from "@/lib/store";
import { ActivityDataAttributes } from "@/models/ActivityData";
import { api } from "@/services/api";
import { AddIcon, ArrowBackIcon, ChevronRightIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  Icon,
  IconButton,
  Link,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableContainer,
  Tabs,
  Tag,
  TagLabel,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Trans } from "react-i18next";
import { FaNetworkWired } from "react-icons/fa";
import { FiTrash2 } from "react-icons/fi";
import { MdMoreVert, MdOutlineHomeWork } from "react-icons/md";
import { useSelector } from "react-redux";

function SubSectorPage({
  params: { lng, step, inventory: inventoryId, subsector },
}: {
  params: { lng: string; step: string; inventory: string; subsector: string };
}) {
  const router = useRouter();
  const { t } = useTranslation(lng, "data");
  const [isMethodologySelected, setIsMethodologySelected] = useState(false);
  const [selectedMethodology, setSelectedMethodology] = useState("");

  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery(inventoryId);
  const { data: userActivities, isLoading: areActivitiesLoading } =
    api.useGetActivityValuesQuery({ inventoryId, subSectorId: subsector });

  console.log(userActivities);

  const [isUnavailableChecked, setIsChecked] = useState<boolean>(false);

  const [hasActivityData, setHasActivityData] = useState<boolean>(false);

  const handleSwitch = (e: any) => {
    setIsChecked(!isUnavailableChecked);
  };

  // TODO add to DB and get from there
  const METHODOLOGIES = [
    {
      methodologyId: "1",
      name: t("fuel-combustion-consumption"),
      description: t("fuel-combustion-consuption-desciption"),
      inputRequired: [t("total-fuel-consumed")],
      disabled: false,
    },
    {
      methodologyId: "2",
      name: t("scaled-sample-data"),
      description: t("scaled-sample-data-desc"),
      inputRequired: [t("sample-fuel"), t("scaling-data")],
      disabled: false,
    },
    {
      methodologyId: "3",
      name: t("modeled-data"),
      description: t("modeled-data-desc"),
      inputRequired: [t("modeled-fuel"), t("build-area")],
      disabled: true,
    },
    {
      methodologyId: "4",
      name: t("direct-measure"),
      description: t("direct-measure-desc"),
      inputRequired: [t("emissions-data")],
      disabled: false,
    },
  ];
  const suggestedActivities = [
    {
      id: "1",
      name: t("commercial-buildings"),
    },
    {
      id: "2",
      name: t("institutional-buildings"),
    },
    {
      id: "3",
      name: t("street-lighting"),
    },
  ];

  const handleMethodologySelected = (methodologyId: string) => {
    setSelectedMethodology(methodologyId);
    setIsMethodologySelected(!isMethodologySelected);
  };

  const {
    isOpen: isAddActivityModalOpen,
    onOpen: onAddActivityModalOpen,
    onClose: onAddActivityModalClose,
  } = useDisclosure();

  const {
    isOpen: isAddActivityModalOpenEC,
    onOpen: onAddActivityModalOpenEC,
    onClose: onAddActivityModalCloseEC,
  } = useDisclosure();

  const {
    isOpen: isChangeMethodologyModalOpen,
    onOpen: onChangeMethodologyOpen,
    onClose: onChangeMethodologyClose,
  } = useDisclosure();

  const {
    isOpen: isDeleteActivitiesModalOpen,
    onOpen: onDeleteActivitiesModalOpen,
    onClose: onDeleteActivitiesModalClose,
  } = useDisclosure();

  const {
    isOpen: isDeleteActivityModalOpen,
    onOpen: onDeleteActivityModalOpen,
    onClose: onDeleteActivityModalClose,
  } = useDisclosure();

  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  const [selectedTab, setSelectedTab] = useState(1); // sector ID (1/2/3)

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
  const subsectorData = useSelector(
    (state: RootState) => state.subsector.subsector,
  );

  const changeMethodology = () => {
    setSelectedMethodology("");
    setIsMethodologySelected(false);
    onChangeMethodologyClose();
  };

  const [deleteActivity, isDeleteActivityLoading] =
    api.useDeleteActivityValueMutation();

  const deleteAllActivities = () => {
    if (areActivitiesLoading || userActivities.length === 0) {
      onDeleteActivitiesModalClose();
      return;
    }

    for (const activity of userActivities) {
      deleteActivity({ inventoryId, activityValueId: activity.id });
    }

    onDeleteActivitiesModalClose();
  };

  // calculate total consumption and emissions
  const totalConsumption = 123.3;
  const totalConsumptionUnit = "M gallons";
  const totalEmissions = 11.465; // MtCO2e

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

  return (
    <>
      <Box id="top" />
      <MotionBox
        bg="background.backgroundLight"
        borderColor="border.neutral"
        borderBottomWidth={scrollPosition > 0 ? "1px" : ""}
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
                    {subsectorData?.subsectorName}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </Breadcrumb>
            </Box>
          </Box>
          <Box display="flex">
            {scrollPosition > 0 ? (
              <Box>
                <Link href="#">
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
              <Tab onClick={() => setSelectedTab(1)}>
                <Text
                  fontFamily="heading"
                  fontSize="title.md"
                  fontWeight="medium"
                >
                  {t("scope")} 1
                </Text>
              </Tab>
              <Tab onClick={() => setSelectedTab(2)}>
                {" "}
                <Text
                  fontFamily="heading"
                  fontSize="title.md"
                  fontWeight="medium"
                >
                  {t("scope")} 2
                </Text>
              </Tab>
            </MotionTabList>

            <TabPanels>
              <ActivityTab t={t} />
              <ActivityTab t={t} />
            </TabPanels>
          </Tabs>
        </Box>
        <AddActivityModal
          t={t}
          userInfo={null}
          isOpen={isAddActivityModalOpen}
          onClose={onAddActivityModalClose}
          hasActivityData={hasActivityData}
          setHasActivityData={setHasActivityData}
        />
        <AddActivityModalEnergyConsumption
          t={t}
          userInfo={null}
          isOpen={isAddActivityModalOpenEC}
          onClose={onAddActivityModalCloseEC}
          hasActivityData={hasActivityData}
          setHasActivityData={setHasActivityData}
        />
        <ChangeMethodology
          t={t}
          onClose={onChangeMethodologyClose}
          isOpen={isChangeMethodologyModalOpen}
          onChangeClicked={changeMethodology}
        />
        <DeleteAllActivitiesModal
          t={t}
          isOpen={isDeleteActivitiesModalOpen}
          onClose={onDeleteActivitiesModalClose}
        />
      </div>
    </>
  );
}

export default SubSectorPage;
