"use client";

import MethodologyCard from "@/components/Cards/methodology-card";
import SuggestedActivityCard from "@/components/Cards/suggested-activities-card";
import AddActivityModalEnergyConsumption from "@/components/Modals/add-activity-energy-consumption-modal";
import AddActivityModal from "@/components/Modals/add-activity-modal";
import ChangeMethodology from "@/components/Modals/change-methodology";
import DeleteActivityModal from "@/components/Modals/delete-activity-modal";
import DeleteAllActivitiesModal from "@/components/Modals/delete-all-activities-modal";
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

  const { data: inventory, isLoading: isInventoryLoading } = api.useGetInventoryQuery(inventoryId);
  const { data: userActivities, isLoading: areActivitiesLoading } = api.useGetActivityValuesQuery({inventoryId, subSectorId: subsector});

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
  }

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
  }

  const [deleteActivity, isDeleteActivityLoading] = api.useDeleteActivityValueMutation();

  const deleteAllActivities = () => {
    if (areActivitiesLoading || userActivities.length === 0) {
      onDeleteActivitiesModalClose();
      return;
    }

    for (const activity of userActivities) {
      deleteActivity({ inventoryId, activityValueId: activity.id });
    }

    onDeleteActivitiesModalClose();
  }

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
    <Box>
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
              <TabPanel p="0" pt="48px">
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb="48px"
                >
                  <HeadingText title={t("add-data-manually")} />
                  <Box display="flex" gap="16px" fontSize="label.lg">
                    <Switch isChecked={isUnavailableChecked} onChange={handleSwitch} />
                    <Text fontFamily="heading" fontWeight="medium">
                      {t("scope-not-applicable")}
                    </Text>
                  </Box>
                </Box>
                {isMethodologySelected ? (
                  <>
                    <Box
                      h="auto"
                      px="24px"
                      py="32px"
                      bg="base.light"
                      borderRadius="8px"
                    >
                      {" "}
                      {isMethodologySelected ? (
                        <Box>
                          <Text
                            fontFamily="heading"
                            fontSize="10px"
                            fontWeight="semibold"
                            letterSpacing="widest"
                            textTransform="uppercase"
                            color="content.tertiary"
                          >
                            {t("methodology")}
                          </Text>
                          <Box display="flex" justifyContent="space-between">
                            <Box>
                              <HeadingText
                                title={t("fuel-combustion-consumption")}
                              />
                              <Text
                                letterSpacing="wide"
                                fontSize="body.lg"
                                fontWeight="normal"
                                color="interactive.control"
                              >
                                {t("fuel-combustion-consumption-description")}
                              </Text>
                            </Box>
                            <Box display="flex" alignItems="center">
                              <Button
                                onClick={onAddActivityModalOpen}
                                title="Add Activity"
                                leftIcon={<AddIcon h="16px" w="16px" />}
                                h="48px"
                                aria-label="activity-button"
                                fontSize="button.md"
                                gap="8px"
                              >
                                {t("add-activity")}
                              </Button>
                              <Popover>
                                <PopoverTrigger>
                                  <IconButton
                                    icon={<MdMoreVert size="24px" />}
                                    aria-label="more-icon"
                                    variant="ghost"
                                    color="content.tertiary"
                                  />
                                </PopoverTrigger>
                                <PopoverContent
                                  w="auto"
                                  borderRadius="8px"
                                  shadow="2dp"
                                  px="0"
                                >
                                  <PopoverArrow />
                                  <PopoverBody p="0px">
                                    <Box
                                      p="16px"
                                      display="flex"
                                      alignItems="center"
                                      gap="16px"
                                      _hover={{
                                        bg: "content.link",
                                        cursor: "pointer",
                                      }}
                                      className="group"
                                      onClick={onChangeMethodologyOpen}
                                    >
                                      <Icon
                                        className="group-hover:text-white"
                                        color="interactive.control"
                                        as={FaNetworkWired}
                                        h="24px"
                                        w="24px"
                                      />
                                      <Text
                                        className="group-hover:text-white"
                                        color="content.primary"
                                      >
                                        Change methodology
                                      </Text>
                                    </Box>
                                    <Box
                                      p="16px"
                                      display="flex"
                                      alignItems="center"
                                      gap="16px"
                                      _hover={{
                                        bg: "content.link",
                                        cursor: "pointer",
                                      }}
                                      className="group"
                                      onClick={onDeleteActivitiesModalOpen}
                                    >
                                      <Icon
                                        className="group-hover:text-white"
                                        color="sentiment.negativeDefault"
                                        as={FiTrash2}
                                        h="24px"
                                        w="24px"
                                      />
                                      <Text
                                        className="group-hover:text-white"
                                        color="content.primary"
                                      >
                                        Delete all activities
                                      </Text>
                                    </Box>
                                  </PopoverBody>
                                </PopoverContent>
                              </Popover>
                            </Box>
                          </Box>
                        <Box>
                      <Box
                        mt="48px"
                        display="flex"
                        flexDirection="column"
                        gap="16px"
                      >
                        {hasActivityData ? (
                         <Box>
                         <Accordion
                           defaultIndex={[0]}
                           allowMultiple
                           bg="white"
                         >
                           <AccordionItem bg="none">
                             <h2>
                               <AccordionButton
                                 h="100px"
                                 bg="base.light"
                                 borderWidth="1px"
                                 borderColor="border.overlay"
                                 px="24px"
                               >
                                    <Box
                                      display="flex"
                                      justifyContent="space-between"
                                      w="full"
                                      alignItems="center"
                                    >
                                      <Box
                                        display="flex"
                                        flexDir="column"
                                        alignItems="start"
                                        gap="8px"
                                      >
                                        <Text
                                          fontFamily="heading"
                                          fontSize="title.md"
                                          fontWeight="semibold"
                                        >
                                          {t("commercial-buildings")}
                                        </Text>
                                        <Text
                                          color="content.tertiary"
                                          letterSpacing="wide"
                                          fontSize="body.md"
                                        >
                                          {userActivities.length} {t("activities-added")}
                                        </Text>
                                      </Box>
                                      <Box
                                        alignItems="start"
                                        display="flex"
                                        fontFamily="heading"
                                      >
                                        <Text fontWeight="medium">
                                          {t("total-consumption")}:&nbsp;
                                        </Text>
                                        <Text fontWeight="normal">
                                          {totalConsumption} {totalConsumptionUnit}
                                        </Text>
                                      </Box>
                                      <Box
                                        alignItems="start"
                                        display="flex"
                                        fontFamily="heading"
                                      >
                                        <Text fontWeight="medium">
                                          {t("emissions")}:&nbsp;
                                        </Text>
                                        <Text fontWeight="normal">
                                          {totalEmissions} MtCO2e
                                        </Text>
                                      </Box>
                                      <Box
                                        onClick={onAddActivityModalOpen}
                                        pr="56px"
                                      >
                                        <AddIcon color="interactive.control" />
                                      </Box>
                                    </Box>
                                    <AccordionIcon />
                                  </AccordionButton>
                                </h2>
                                <AccordionPanel p={0}>
                                  <TableContainer>
                                    <Table
                                      variant="simple"
                                      borderWidth="1px"
                                      borderRadius="20px"
                                      bg="base.light"
                                    >
                                      <Thead bg="background.neutral">
                                        <Tr>
                                          <Th>{t("fuel-type")}</Th>
                                          <Th>{t("data-quality")}</Th>
                                          <Th>{t("fuel-consumption")}</Th>
                                          <Th>{t("emissions")}</Th>
                                          <Th></Th>
                                        </Tr>
                                      </Thead>
                                      <Tbody>
                                        {userActivities?.map(
                                          (activity: any, i: number) => {
                                            return (
                                              <Tr key={i}>
                                                <Td>{activity?.fuelType}</Td>
                                                <Td>
                                                  <Tag
                                                    size="lg"
                                                    variant="outline"
                                                    borderWidth="1px"
                                                    shadow="none"
                                                    borderColor="content.link"
                                                    borderRadius="full"
                                                    bg="background.neutral"
                                                    color="content.link"  
                                                  >
                                                    <TagLabel>
                                                      {activity?.dataQuality}
                                                    </TagLabel>
                                                  </Tag>
                                                </Td>
                                                <Td>
                                                  {activity?.fuelConsumption!}{" "}
                                                  {t("gallons")}
                                                </Td>
                                                <Td>
                                                  {activity?.emissions} tCO2e
                                                </Td>
                                                <Td isNumeric>
                                                  <IconButton
                                                    color="interactive.control"
                                                    variant="ghost"
                                                    aria-label="activity-data-popover"
                                                    icon={
                                                      <MdMoreVert size="24px" />
                                                    }
                                                  />
                                                </Td>
                                              </Tr>
                                            );
                                          },
                                        )}
                                      </Tbody>
                                    </Table>
                                  </TableContainer>
                                </AccordionPanel>
                              </AccordionItem>
                            </Accordion>

                            <Box
                              w="full"
                              borderTopWidth="3px"
                              borderColor="interactive.secondary"
                              py="32px"
                              px="48px"
                            >
                              <Box display="flex" justifyContent="space-between">
                                <Text
                                  fontFamily="heading"
                                  fontSize="title.md"
                                  fontWeight="semibold"
                                  color="content.secondary"
                                >
                                  {t("total-emissions")}
                                </Text>
                                <Text
                                  fontFamily="heading"
                                  fontWeight="semibold"
                                  fontSize="headline.md"
                                >
                                  {totalEmissions} MtCO2e
                                </Text>
                              </Box>
                            </Box>
                          </Box>
                        ) : (
                          <Box className="flex flex-col gap-4">
                            {
                              areActivitiesLoading ? (
                                <LoadingState />
                              ) : (
                                // TODO add activityData and metadata to ActivityData model
                                <>
                                        <Box
                                  display="flex"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    mb="8px"
                                  >
                                    <HeadingText title={t("select-methodology-title")} />
                        </Box>
                                
                                {userActivities?.map((activity: ActivityDataAttributes & { activityData: any, metadata: any }) => (
                                  <SuggestedActivityCard
                                    key={activity.activitydataId}
                                    name={activity.activityData.buildingType ?? "Unknown"}
                                    t={t}
                                    isSelected={selectedActivity === activity.activitydataId}
                                    onActivityAdded={() => {
                                      setSelectedActivity(activity.activitydataId);
                                      setTimeout(onAddActivityModalOpen, 500);
                                    }}
                                  />
                                ))}
                              </>
                              )}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    {isUnavailableChecked ? (
                      <Box>
                        <HeadingText title={t("scope-unavailable")} />
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                          mt="8px"
                        >
                          {t("scope-unavailable-description")}
                        </Text>
                        <Box mt="48px">
                          <Text
                            fontWeight="bold"
                            fontSize="title.md"
                            fontFamily="heading"
                            pt="48px"
                            pb="24px"
                          >
                            {t("select-reason")}
                          </Text>
                          <RadioGroup>
                            <Stack direction="column">
                              <Radio
                                value={t("select-reason-1")}
                                color="interactive.secondary"
                              >
                                {t("select-reason-1")}
                              </Radio>
                              <Radio value={t("select-reason-2")}>
                                {t("select-reason-2")}
                              </Radio>
                              <Radio value={t("select-reason-3")}>
                                {t("select-reason-3")}
                              </Radio>
                              <Radio value={t("select-reason-4")}>
                                {t("select-reason-4")}
                              </Radio>
                            </Stack>
                          </RadioGroup>
                          <Text
                            fontWeight="medium"
                            fontSize="title.md"
                            fontFamily="heading"
                            pt="48px"
                            pb="24px"
                            letterSpacing="wide"
                          >
                            {t("explanation-justification")}
                          </Text>
                          <Textarea
                            borderRadius="4px"
                            borderWidth="1px"
                            borderColor="border.neutral"
                            backgroundColor="base.light"
                            placeholder={t("textarea-placeholder-text")}
                          />
                          <Button h="48px" p="16px" mt="24px">
                            {t("save-changes")}
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      <Box>
                        {isUnavailableChecked && (
                          <Box>
                            <HeadingText title={t("scope-unavailable")} />
                            <Text
                              letterSpacing="wide"
                              fontSize="body.lg"
                              fontWeight="normal"
                              color="interactive.control"
                              mt="8px"
                            >
                              {t("scope-unavailable-description")}
                            </Text>
                            <Box mt="48px">
                              {!hasActivityData && (
                                <HeadingText
                                  title={t("select-methodology-title")}
                                />)}
                            </Box>
                          </Box>
                        )}
                        {isMethodologySelected ? (
                          <Box>
                            <Text
                              fontFamily="heading"
                              fontSize="10px"
                              fontWeight="semibold"
                              letterSpacing="widest"
                              textTransform="uppercase"
                              color="content.tertiary"
                            >
                              {t("methodology")}
                            </Text>
                            <Box display="flex" justifyContent="space-between">
                              <Box>
                                <HeadingText
                                  title={t("fuel-combustion-consumption")}
                                />
                                <Text
                                  letterSpacing="wide"
                                  fontSize="body.lg"
                                  fontWeight="normal"
                                  color="interactive.control"
                                >
                                  {t("fuel-combustion-consumption-description")}
                                </Text>
                              </Box>
                              <Box display="flex" alignItems="center">
                                <Button
                                  onClick={onAddActivityModalOpen}
                                  title="Add Activity"
                                  leftIcon={<AddIcon h="16px" w="16px" />}
                                  h="48px"
                                  aria-label="activity-button"
                                  fontSize="button.md"
                                  gap="8px"
                                >
                                  {t("add-activity")}
                                </Button>
                                <Popover>
                                  <PopoverTrigger>
                                    <IconButton
                                      icon={<MdMoreVert size="24px" />}
                                      aria-label="more-icon"
                                      variant="ghost"
                                      color="content.tertiary"
                                    />
                                  </PopoverTrigger>
                                  <PopoverContent
                                    w="auto"
                                    borderRadius="8px"
                                    shadow="2dp"
                                    px="0"
                                  >
                                    <PopoverArrow />
                                    <PopoverBody p="0px">
                                      <Box
                                        p="16px"
                                        display="flex"
                                        alignItems="center"
                                        gap="16px"
                                        _hover={{
                                          bg: "content.link",
                                          cursor: "pointer",
                                        }}
                                        className="group"
                                        onClick={onChangeMethodologyOpen}
                                      >
                                        <Icon
                                          className="group-hover:text-white"
                                          color="interactive.control"
                                          as={FaNetworkWired}
                                          h="24px"
                                          w="24px"
                                        />
                                        <Text
                                          className="group-hover:text-white"
                                          color="content.primary"
                                        >
                                          Change methodology
                                        </Text>
                                      </Box>
                                      <Box
                                        p="16px"
                                        display="flex"
                                        alignItems="center"
                                        gap="16px"
                                        _hover={{
                                          bg: "content.link",
                                          cursor: "pointer",
                                        }}
                                        className="group"
                                        onClick={onDeleteActivitiesModalOpen}
                                      >
                                        <Icon
                                          className="group-hover:text-white"
                                          color="sentiment.negativeDefault"
                                          as={FiTrash2}
                                          h="24px"
                                          w="24px"
                                        />
                                        <Text
                                          className="group-hover:text-white"
                                          color="content.primary"
                                        >
                                          Delete all activities
                                        </Text>
                                      </Box>
                                    </PopoverBody>
                                  </PopoverContent>
                                </Popover>
                              </Box>
                            </Box>
                            <Box
                              mt="48px"
                              display="flex"
                              flexDirection="column"
                              gap="16px"
                            >
                              {!hasActivityData ? (
                                <Text
                                  fontFamily="heading"
                                  fontSize="title.md"
                                  fontWeight="semibold"
                                  color="content.secondary"
                                >
                                  {t("activity-suggestion")}
                                </Text>
                              ) : (
                                ""
                              )}
                              {hasActivityData ? (
                                <Box>
                                  <Accordion
                                    defaultIndex={[0]}
                                    allowMultiple
                                    bg="white"
                                  >
                                    <AccordionItem bg="none">
                                      <h2>
                                        <AccordionButton
                                          h="100px"
                                          bg="base.light"
                                          borderWidth="1px"
                                          borderColor="border.overlay"
                                          px="24px"
                                        >
                                          <Box
                                            display="flex"
                                            justifyContent="space-between"
                                            w="full"
                                            alignItems="center"
                                          >
                                            <Box
                                              display="flex"
                                              flexDir="column"
                                              alignItems="start"
                                              gap="8px"
                                            >
                                              <Text
                                                fontFamily="heading"
                                                fontSize="title.md"
                                                fontWeight="semibold"
                                              >
                                                {t("commercial-buildings")}
                                              </Text>
                                              <Text
                                                color="content.tertiary"
                                                letterSpacing="wide"
                                                fontSize="body.md"
                                              >
                                                {userActivities.length} {t("activities-added")}
                                              </Text>
                                            </Box>
                                            <Box
                                              alignItems="start"
                                              display="flex"
                                              fontFamily="heading"
                                            >
                                              <Text fontWeight="medium">
                                                {t("total-consumption")}:&nbsp;
                                              </Text>
                                              <Text fontWeight="normal">
                                                {totalConsumption} {totalConsumptionUnit}
                                              </Text>
                                            </Box>
                                            <Box
                                              alignItems="start"
                                              display="flex"
                                              fontFamily="heading"
                                            >
                                              <Text fontWeight="medium">
                                                {t("emissions")}:&nbsp;
                                              </Text>
                                              <Text fontWeight="normal">
                                                {totalEmissions} MtCO2e
                                              </Text>
                                            </Box>
                                            <Box
                                              onClick={onAddActivityModalOpen}
                                              pr="56px"
                                            >
                                              <AddIcon
                                                color="content.tertiary"
                                                h="24px"
                                                w="24px"
                                              />
                                            </Box>
                                          </Box>
                                          <AccordionIcon
                                            color="content.tertiary"
                                            h="36px"
                                            w="36px"
                                          />
                                        </AccordionButton>
                                      </h2>
                                      <AccordionPanel p={0}>
                                        <TableContainer>
                                          <Table
                                            variant="simple"
                                            borderWidth="1px"
                                            borderRadius="20px"
                                            bg="base.light"
                                          >
                                            <Thead bg="background.backgroundLight">
                                              <Tr>
                                                <Th>{t("fuel-type")}</Th>
                                                <Th>{t("data-quality")}</Th>
                                                <Th>{t("fuel-consumption")}</Th>
                                                <Th>{t("emissions")}</Th>
                                                <Th></Th>
                                              </Tr>
                                            </Thead>
                                            <Tbody>
                                              {userActivities?.map(
                                                (activity: any, i: number) => {
                                                  return (
                                                    <Tr key={i}>
                                                      <Td>
                                                        {activity?.fuelType}
                                                      </Td>
                                                      <Td>
                                                        <Tag
                                                          size="lg"
                                                          variant="outline"
                                                          borderWidth="1px"
                                                          shadow="none"
                                                          borderColor="content.link"
                                                          borderRadius="full"
                                                          bg="background.neutral"
                                                          color="content.link"
                                                        >
                                                          <TagLabel>
                                                            {
                                                              activity?.dataQuality
                                                            }
                                                          </TagLabel>
                                                        </Tag>
                                                      </Td>
                                                      <Td>
                                                        {
                                                          activity?.fuelConsumption!
                                                        }{" "}
                                                        {t("gallons")}
                                                      </Td>
                                                      <Td>
                                                        {activity?.emissions}{" "}
                                                        tCO2e
                                                      </Td>
                                                      <Td isNumeric>
                                                        <Popover>
                                                          <PopoverTrigger>
                                                            <IconButton
                                                              icon={
                                                                <MdMoreVert size="24px" />
                                                              }
                                                              aria-label="more-icon"
                                                              variant="ghost"
                                                              color="content.tertiary"
                                                            />
                                                          </PopoverTrigger>
                                                          <PopoverContent
                                                            w="auto"
                                                            borderRadius="8px"
                                                            shadow="2dp"
                                                            px="0"
                                                          >
                                                            <PopoverArrow />
                                                            <PopoverBody p="0px">
                                                              <Box
                                                                p="16px"
                                                                display="flex"
                                                                alignItems="center"
                                                                gap="16px"
                                                                _hover={{
                                                                  bg: "content.link",
                                                                  cursor:
                                                                    "pointer",
                                                                }}
                                                                className="group"
                                                              >
                                                                <Icon
                                                                  className="group-hover:text-white"
                                                                  color="interactive.control"
                                                                  as={
                                                                    FaNetworkWired
                                                                  }
                                                                  h="24px"
                                                                  w="24px"
                                                                />
                                                                <Text
                                                                  className="group-hover:text-white"
                                                                  color="content.primary"
                                                                >
                                                                  Edit activity
                                                                </Text>
                                                              </Box>
                                                              <Box
                                                                p="16px"
                                                                display="flex"
                                                                alignItems="center"
                                                                gap="16px"
                                                                _hover={{
                                                                  bg: "content.link",
                                                                  cursor:
                                                                    "pointer",
                                                                }}
                                                                className="group"
                                                                onClick={
                                                                  onDeleteActivityModalOpen
                                                                }
                                                              >
                                                                <Icon
                                                                  className="group-hover:text-white"
                                                                  color="sentiment.negativeDefault"
                                                                  as={FiTrash2}
                                                                  h="24px"
                                                                  w="24px"
                                                                />
                                                                <Text
                                                                  className="group-hover:text-white"
                                                                  color="content.primary"
                                                                >
                                                                  Delete activity
                                                                </Text>
                                                              </Box>
                                                            </PopoverBody>
                                                          </PopoverContent>
                                                        </Popover>
                                                      </Td>
                                                    </Tr>
                                                  );
                                                },
                                              )}
                                            </Tbody>
                                          </Table>
                                        </TableContainer>
                                      </AccordionPanel>
                                    </AccordionItem>
                                  </Accordion>
                                </Box>
                              ) : (
                                <Box className="flex flex-col gap-4">
                                  {suggestedActivities.map(({ id, name }) => (
                                    <SuggestedActivityCard
                                      key={id}
                                      name={name}
                                      t={t}
                                      isSelected={selectedActivity === id}
                                      onActivityAdded={onAddActivityModalOpen}
                                    />
                                  ))}
                                </Box>
                              )}
                            </Box>
                          </Box>
                        ) : (
                          <Box>
                            {isUnavailableChecked ? (
                              <Box>
                                <HeadingText title={t("scope-unavailable")} />
                                <Text
                                  letterSpacing="wide"
                                  fontSize="body.lg"
                                  fontWeight="normal"
                                  color="interactive.control"
                                  mt="8px"
                                >
                                  {t("scope-unavailable-description")}
                                </Text>
                                <Box mt="48px">
                                  <Text
                                    fontWeight="bold"
                                    fontSize="title.md"
                                    fontFamily="heading"
                                    pt="48px"
                                    pb="24px"
                                  >
                                    {t("select-reason")}
                                  </Text>
                                  <RadioGroup>
                                    <Stack direction="column">
                                      <Radio
                                        value={t("select-reason-1")}
                                        color="interactive.secondary"
                                      >
                                        {t("select-reason-1")}
                                      </Radio>
                                      <Radio value={t("select-reason-2")}>
                                        {t("select-reason-2")}
                                      </Radio>
                                      <Radio value={t("select-reason-3")}>
                                        {t("select-reason-3")}
                                      </Radio>
                                      <Radio value={t("select-reason-4")}>
                                        {t("select-reason-4")}
                                      </Radio>
                                    </Stack>
                                  </RadioGroup>
                                  <Text
                                    fontWeight="medium"
                                    fontSize="title.md"
                                    fontFamily="heading"
                                    pt="48px"
                                    pb="24px"
                                    letterSpacing="wide"
                                  >
                                    {t("explanation-justification")}
                                  </Text>
                                  <Textarea
                                    borderRadius="4px"
                                    borderWidth="1px"
                                    borderColor="border.neutral"
                                    backgroundColor="base.light"
                                    placeholder={t("textarea-placeholder-text")}
                                  />
                                  <Button h="48px" p="16px" mt="24px">
                                    {t("save-changes")}
                                  </Button>
                                </Box>
                              </Box>
                            ) : (
                              <Box>
                                <Text
                                  letterSpacing="wide"
                                  fontSize="body.lg"
                                  fontWeight="normal"
                                  color="interactive.control"
                                >
                                  <Trans
                                    t={t}
                                    i18nKey="add-data-manually-desciption"
                                  >
                                    To add your inventory data manually, select
                                    the methodology used to collect the data and
                                    calculate your emissions.{" "}
                                    <Link
                                      href="/"
                                      color="content.link"
                                      fontWeight="bold"
                                      textDecoration="underline"
                                    >
                                      Learn more
                                    </Link>{" "}
                                    about methodologies
                                  </Trans>
                                </Text>
                                <Text
                                  fontWeight="bold"
                                  fontSize="title.md"
                                  fontFamily="heading"
                                  pt="48px"
                                  pb="24px"
                                >
                                  {t("select-methodology")}
                                </Text>
                                <Box
                                  gap="16px"
                                  display="flex"
                                  justifyContent="space-between"
                                >
                                  {METHODOLOGIES.map(
                                    ({ methodologyId, name, description, inputRequired, disabled }) => (
                                      <MethodologyCard
                                        methodologyId={methodologyId}
                                        key={name}
                                        name={name}
                                        description={description}
                                        inputRequired={inputRequired}
                                        isSelected={selectedMethodology === name}
                                        disabled={disabled}
                                        t={t}
                                        handleCardSelect={handleMethodologySelected}
                                      />
                                    ),
                                  )}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        )}
                      </Box>
                    )}
                    {hasActivityData && (
                      <Box
                        w="full"
                        borderTopWidth="3px"
                        borderColor="interactive.secondary"
                        py="32px"
                        px="48px"
                        bottom="0px"
                        bg="base.light"
                      >
                        <Box display="flex" justifyContent="space-between">
                          <Text
                            fontFamily="heading"
                            fontWeight="semibold"
                            fontSize="headline.md"
                          >
                            {t("total-emissions")}
                          </Text>
                          <Text
                            fontFamily="heading"
                            fontWeight="semibold"
                            fontSize="headline.md"
                          >
                            15,4M tCO2
                          </Text>
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}
                </Box>
                </>
                ):""}
              </TabPanel>
              <TabPanel p="0" pt="48px">
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb="48px"
                >
                  <HeadingText title={t("add-data-manually")} />
                  <Box display="flex" gap="16px" fontSize="label.lg">
                    <Switch isChecked={isUnavailableChecked} onChange={handleSwitch} />
                    <Text fontFamily="heading" fontWeight="medium">
                      {t("scope-not-applicable")}
                    </Text>
                  </Box>
                </Box>
                {areActivitiesLoading ? (
                  <LoadingState />
                ) : (
                  <Box
                    h="auto"
                    px="24px"
                    py="32px"
                    bg="base.light"
                    borderRadius="8px"
                  >
                    {" "}
                    {!isMethodologySelected ? (
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="space-between"
                        mb="8px"
                      >
                        <HeadingText title={t("select-methodology-title")} />
                      </Box>
                    ) : (
                      ""
                    )}
                    {isMethodologySelected ? (
                      <Box>
                        <Text
                          fontFamily="heading"
                          fontSize="10px"
                          fontWeight="semibold"
                          letterSpacing="widest"
                          textTransform="uppercase"
                          color="content.tertiary"
                        >
                          {t("methodology")}
                        </Text>
                        <Box display="flex" justifyContent="space-between">
                          <Box>
                            <HeadingText title={t("energy-consumption")} />
                            <Text
                              letterSpacing="wide"
                              fontSize="body.lg"
                              fontWeight="normal"
                              color="interactive.control"
                            >
                              {t("energy-consumption-description")}
                            </Text>
                          </Box>
                          <Box display="flex" alignItems="center">
                            <Button
                              onClick={onAddActivityModalOpenEC}
                              leftIcon={<AddIcon h="16px" w="16px" />}
                              h="48px"
                              aria-label="activity-button"
                              fontSize="button.md"
                              gap="8px"
                            >
                              {t("add-activity")}
                            </Button>
                            <Popover>
                              <PopoverTrigger>
                                <IconButton
                                  icon={<MdMoreVert size="24px" />}
                                  aria-label="more-icon"
                                  variant="ghost"
                                  color="content.tertiary"
                                />
                              </PopoverTrigger>
                              <PopoverContent
                                w="auto"
                                borderRadius="8px"
                                shadow="2dp"
                                px="0"
                              >
                                <PopoverArrow />
                                <PopoverBody p="0px">
                                  <Box
                                    p="16px"
                                    display="flex"
                                    alignItems="center"
                                    gap="16px"
                                    _hover={{
                                      bg: "content.link",
                                      cursor: "pointer",
                                    }}
                                    className="group"
                                    onClick={onChangeMethodologyOpen}
                                  >
                                    <Icon
                                      className="group-hover:text-white"
                                      color="interactive.control"
                                      as={FaNetworkWired}
                                      h="24px"
                                      w="24px"
                                    />
                                    <Text
                                      className="group-hover:text-white"
                                      color="content.primary"
                                    >
                                      Change methodology
                                    </Text>
                                  </Box>
                                  <Box
                                    p="16px"
                                    display="flex"
                                    alignItems="center"
                                    gap="16px"
                                    _hover={{
                                      bg: "content.link",
                                      cursor: "pointer",
                                    }}
                                    className="group"
                                    onClick={deleteAllActivities}
                                  >
                                    <Icon
                                      className="group-hover:text-white"
                                      color="sentiment.negativeDefault"
                                      as={FiTrash2}
                                      h="24px"
                                      w="24px"
                                    />
                                    <Text
                                      className="group-hover:text-white"
                                      color="content.primary"
                                    >
                                      Delete all activities
                                    </Text>
                                  </Box>
                                </PopoverBody>
                              </PopoverContent>
                            </Popover>
                          </Box>
                        </Box>
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          mb="8px"
                        >
                          {hasActivityData ? (
                            <Box>
                              <Accordion
                                defaultIndex={[0]}
                                allowMultiple
                                bg="white"
                              >
                                <AccordionItem bg="none">
                                  <h2>
                                    <AccordionButton
                                      h="100px"
                                      bg="base.light"
                                      borderWidth="1px"
                                      borderColor="border.overlay"
                                      px="24px"
                                    >
                                      <Box
                                        display="flex"
                                        justifyContent="space-between"
                                        w="full"
                                        alignItems="center"
                                      >
                                        <Box
                                          display="flex"
                                          flexDir="column"
                                          alignItems="start"
                                          gap="8px"
                                        >
                                          <Text
                                            fontFamily="heading"
                                            fontSize="title.md"
                                            fontWeight="semibold"
                                          >
                                            {t("commercial-buildings")}
                                          </Text>
                                          <Text
                                            color="content.tertiary"
                                            letterSpacing="wide"
                                            fontSize="body.md"
                                          >
                                            {userActivities.length} {t("activities-added")}
                                          </Text>
                                        </Box>
                                        <Box
                                          alignItems="start"
                                          display="flex"
                                          fontFamily="heading"
                                        >
                                          <Text fontWeight="medium">
                                            {t("total-consumption")}:&nbsp;
                                          </Text>
                                          <Text fontWeight="normal">
                                            715,4M gallons
                                          </Text>
                                        </Box>
                                        <Box
                                          alignItems="start"
                                          display="flex"
                                          fontFamily="heading"
                                        >
                                          <Text fontWeight="medium">
                                            {t("emissions")}:&nbsp;
                                          </Text>
                                          <Text fontWeight="normal">
                                            15,MtCO2e
                                          </Text>
                                        </Box>
                                        <Box
                                          onClick={onAddActivityModalOpen}
                                          pr="56px"
                                        >
                                          <AddIcon color="interactive.control" />
                                        </Box>
                                      </Box>
                                      <AccordionIcon />
                                    </AccordionButton>
                                  </h2>
                                  <AccordionPanel p={0}>
                                    <TableContainer>
                                      <Table
                                        variant="simple"
                                        borderWidth="1px"
                                        borderRadius="20px"
                                        bg="base.light"
                                      >
                                        <Thead bg="background.neutral">
                                          <Tr>
                                            <Th>{t("fuel-type")}</Th>
                                            <Th>{t("data-quality")}</Th>
                                            <Th>{t("fuel-consumption")}</Th>
                                            <Th>{t("emissions")}</Th>
                                            <Th></Th>
                                          </Tr>
                                        </Thead>
                                        <Tbody>
                                          {userActivities?.map(
                                            (activity: any, i: number) => {
                                              return (
                                                <Tr key={i}>
                                                  <Td>{activity?.fuelType}</Td>
                                                  <Td>
                                                    <Tag
                                                      size="lg"
                                                      variant="outline"
                                                      borderWidth="1px"
                                                      shadow="none"
                                                      borderColor="content.link"
                                                      borderRadius="full"
                                                      bg="background.neutral"
                                                      color="content.link"
                                                    >
                                                      <TagLabel>
                                                        {activity?.dataQuality}
                                                      </TagLabel>
                                                    </Tag>
                                                  </Td>
                                                  <Td>
                                                    {activity?.fuelConsumption!}
                                                  </Td>
                                                  <Td>
                                                    {activity?.emissions} tCO2e
                                                  </Td>
                                                  <Td isNumeric>
                                                    <IconButton
                                                      color="interactive.control"
                                                      variant="ghost"
                                                      aria-label="activity-data-popover"
                                                      icon={
                                                        <MdMoreVert size="24px" />
                                                      }
                                                    />
                                                  </Td>
                                                </Tr>
                                              );
                                            },
                                          )}
                                        </Tbody>
                                      </Table>
                                    </TableContainer>
                                  </AccordionPanel>
                                </AccordionItem>
                              </Accordion>
                            </Box>
                          ) : (
                            <Box className="flex flex-col gap-4 w-full">
                              <Text
                                fontFamily="heading"
                                fontSize="title.md"
                                fontWeight="semibold"
                                color="content.secondary"
                                mt={12}
                              >
                                {t("activity-suggestion")}
                              </Text>
                              {suggestedActivities.map(({ id, name }) => (
                                <SuggestedActivityCard
                                  key={id}
                                  name={name}
                                  t={t}
                                  isSelected={id === selectedActivity}
                                  onActivityAdded={onAddActivityModalOpenEC}
                                />
                              ))}
                            </Box>
                          )}
                        </Box>
                      </Box>
                    ) : (
                      <Box>
                        {!isUnavailableChecked && (
                          <Box>
                            <HeadingText title={t("scope-unavailable")} />
                            <Text
                              letterSpacing="wide"
                              fontSize="body.lg"
                              fontWeight="normal"
                              color="interactive.control"
                              mt="8px"
                            >
                              {t("scope-unavailable-description")}
                            </Text>
                            <Box mt="48px">
                              {!hasActivityData && (
                              <HeadingText
                                title={t("select-methodology-title")}
                              />
                              )}
                              </Box>
                          </Box>
                      )}
                            {isMethodologySelected ? (
                              <Box>
                                <Text
                                  fontFamily="heading"
                                  fontSize="10px"
                                  fontWeight="semibold"
                                  letterSpacing="widest"
                                  textTransform="uppercase"
                                  color="content.tertiary"
                                >
                                  {t("methodology")}
                                </Text>
                                <Box display="flex" justifyContent="space-between">
                                  <Box>
                                    <HeadingText title={t("energy-consumption")} />
                                    <Text
                                      letterSpacing="wide"
                                      fontSize="body.lg"
                                      fontWeight="normal"
                                      color="interactive.control"
                                    >
                                      {t("energy-consumption-description")}
                                    </Text>
                                  </Box>
                                  <Box display="flex" alignItems="center">
                                    <Button
                                      onClick={onAddActivityModalOpenEC}
                                      leftIcon={<AddIcon h="16px" w="16px" />}
                                      h="48px"
                                      aria-label="activity-button"
                                      fontSize="button.md"
                                      gap="8px"
                                    >
                                      {t("add-activity")}
                                    </Button>
                                    <Popover>
                                      <PopoverTrigger>
                                        <IconButton
                                          icon={<MdMoreVert size="24px" />}
                                          aria-label="more-icon"
                                          variant="ghost"
                                          color="content.tertiary"
                                        />
                                      </PopoverTrigger>
                                      <PopoverContent
                                        w="auto"
                                        borderRadius="8px"
                                        shadow="2dp"
                                        px="0"
                                      >
                                        <PopoverArrow />
                                        <PopoverBody p="0px">
                                          <Box
                                            p="16px"
                                            display="flex"
                                            alignItems="center"
                                            gap="16px"
                                            _hover={{
                                              bg: "content.link",
                                              cursor: "pointer",
                                            }}
                                            className="group"
                                            onClick={onChangeMethodologyOpen}
                                          >
                                            <Icon
                                              className="group-hover:text-white"
                                              color="interactive.control"
                                              as={FaNetworkWired}
                                              h="24px"
                                              w="24px"
                                            />
                                            <Text
                                              className="group-hover:text-white"
                                              color="content.primary"
                                            >
                                              Change methodology
                                            </Text>
                                          </Box>
                                          <Box
                                            p="16px"
                                            display="flex"
                                            alignItems="center"
                                            gap="16px"
                                            _hover={{
                                              bg: "content.link",
                                              cursor: "pointer",
                                            }}
                                            className="group"
                                            onClick={onDeleteActivitiesModalOpen}
                                          >
                                            <Icon
                                              className="group-hover:text-white"
                                              color="sentiment.negativeDefault"
                                              as={FiTrash2}
                                              h="24px"
                                              w="24px"
                                            />
                                            <Text
                                              className="group-hover:text-white"
                                              color="content.primary"
                                            >
                                              Delete all activities
                                            </Text>
                                          </Box>
                                        </PopoverBody>
                                      </PopoverContent>
                                    </Popover>
                                  </Box>
                                </Box>
                                <Box
                                  mt="48px"
                                  display="flex"
                                  flexDirection="column"
                                  gap="16px"
                                >
                                  {hasActivityData ? (
                                    ""
                                  ) : (
                                    <Text
                                      fontFamily="heading"
                                      fontSize="title.md"
                                      fontWeight="semibold"
                                      color="content.secondary"
                                    >
                                      {t("activity-suggestion")}
                                    </Text>
                                  )}
                                  {hasActivityData ? (
                                    <Box>
                                      <Accordion
                                        defaultIndex={[0]}
                                        allowMultiple
                                        bg="white"
                                      >
                                        <AccordionItem bg="none">
                                          <h2>
                                            <AccordionButton
                                              h="100px"
                                              bg="base.light"
                                              borderWidth="1px"
                                              borderColor="border.overlay"
                                              px="24px"
                                            >
                                              <Box
                                                display="flex"
                                                justifyContent="space-between"
                                                w="full"
                                                alignItems="center"
                                              >
                                                <Box
                                                  display="flex"
                                                  flexDir="column"
                                                  alignItems="start"
                                                  gap="8px"
                                                >
                                                  <Text
                                                    fontFamily="heading"
                                                    fontSize="title.md"
                                                    fontWeight="semibold"
                                                  >
                                                    {t("commercial-buildings")}
                                                  </Text>
                                                  <Text
                                                    color="content.tertiary"
                                                    letterSpacing="wide"
                                                    fontSize="body.md"
                                                  >
                                                    {userActivities.length} {t("activities-added")}
                                                  </Text>
                                                </Box>
                                                <Box
                                                  alignItems="start"
                                                  display="flex"
                                                  fontFamily="heading"
                                                >
                                                  <Text fontWeight="medium">
                                                    {t("total-consumption")}:&nbsp;
                                                  </Text>
                                                  <Text fontWeight="normal">
                                                    715,4M gallons
                                                  </Text>
                                                </Box>
                                                <Box
                                                  alignItems="start"
                                                  display="flex"
                                                  fontFamily="heading"
                                                >
                                                  <Text fontWeight="medium">
                                                    {t("emissions")}:&nbsp;
                                                  </Text>
                                                  <Text fontWeight="normal">
                                                    15,MtCO2e
                                                  </Text>
                                                </Box>
                                                <Box
                                                  onClick={onAddActivityModalOpen}
                                                  pr="56px"
                                                >
                                                  <AddIcon color="interactive.control" />
                                                </Box>
                                              </Box>
                                              <AccordionIcon />
                                            </AccordionButton>
                                          </h2>
                                          <AccordionPanel p={0}>
                                            <TableContainer>
                                              <Table
                                                variant="simple"
                                                borderWidth="1px"
                                                borderRadius="20px"
                                                bg="base.light"
                                              >
                                                <Thead bg="background.backgroundLight">
                                                  <Tr>
                                                    <Th>{t("fuel-type")}</Th>
                                                    <Th>{t("data-quality")}</Th>
                                                    <Th>{t("fuel-consumption")}</Th>
                                                    <Th>{t("emissions")}</Th>
                                                    <Th></Th>
                                                  </Tr>
                                                </Thead>
                                                <Tbody>
                                                  {userActivities?.map(
                                                    (activity: any, i: number) => {
                                                      return (
                                                        <Tr key={i}>
                                                          <Td>
                                                            {activity?.fuelType}
                                                          </Td>
                                                          <Td>
                                                            <Tag
                                                              size="lg"
                                                              variant="outline"
                                                              borderWidth="1px"
                                                              shadow="none"
                                                              borderColor="content.link"
                                                              borderRadius="full"
                                                              bg="background.neutral"
                                                              color="content.link"
                                                            >
                                                              <TagLabel>
                                                                {
                                                                  activity?.dataQuality
                                                                }
                                                              </TagLabel>
                                                            </Tag>
                                                          </Td>
                                                          <Td>
                                                            {
                                                              activity?.fuelConsumption!
                                                            }
                                                          </Td>
                                                          <Td>
                                                            {activity?.emissions}{" "}
                                                            tCO2e
                                                          </Td>
                                                          <Td isNumeric>
                                                            <Popover>
                                                              <PopoverTrigger>
                                                                <IconButton
                                                                  icon={
                                                                    <MdMoreVert size="24px" />
                                                                  }
                                                                  aria-label="more-icon"
                                                                  variant="ghost"
                                                                  color="content.tertiary"
                                                                />
                                                              </PopoverTrigger>
                                                              <PopoverContent
                                                                w="auto"
                                                                borderRadius="8px"
                                                                shadow="2dp"
                                                                px="0"
                                                              >
                                                                <PopoverArrow />
                                                                <PopoverBody p="0px">
                                                                  <Box
                                                                    p="16px"
                                                                    display="flex"
                                                                    alignItems="center"
                                                                    gap="16px"
                                                                    _hover={{
                                                                      bg: "content.link",
                                                                      cursor:
                                                                        "pointer",
                                                                    }}
                                                                    className="group"
                                                                  >
                                                                    <Icon
                                                                      className="group-hover:text-white"
                                                                      color="interactive.control"
                                                                      as={
                                                                        FaNetworkWired
                                                                      }
                                                                      h="24px"
                                                                      w="24px"
                                                                    />
                                                                    <Text
                                                                      className="group-hover:text-white"
                                                                      color="content.primary"
                                                                    >
                                                                      Edit activity
                                                                    </Text>
                                                                  </Box>
                                                                  <Box
                                                                    p="16px"
                                                                    display="flex"
                                                                    alignItems="center"
                                                                    gap="16px"
                                                                    _hover={{
                                                                      bg: "content.link",
                                                                      cursor:
                                                                        "pointer",
                                                                    }}
                                                                    className="group"
                                                                    onClick={
                                                                      onDeleteActivityModalOpen
                                                                    }
                                                                  >
                                                                    <Icon
                                                                      className="group-hover:text-white"
                                                                      color="sentiment.negativeDefault"
                                                                      as={FiTrash2}
                                                                      h="24px"
                                                                      w="24px"
                                                                    />
                                                                    <Text
                                                                      className="group-hover:text-white"
                                                                      color="content.primary"
                                                                    >
                                                                      Delete activity
                                                                    </Text>
                                                                  </Box>
                                                                </PopoverBody>
                                                              </PopoverContent>
                                                            </Popover>
                                                          </Td>
                                                        </Tr>
                                                      );
                                                    },
                                                  )}
                                                </Tbody>
                                              </Table>
                                            </TableContainer>
                                          </AccordionPanel>
                                        </AccordionItem>
                                      </Accordion>
                                    </Box>
                                  ) : (
                                    <Box className="flex flex-col gap-4">
                                      {suggestedActivities.map(({ id, name }) => (
                                        <SuggestedActivityCard
                                          key={id}
                                          name={name}
                                          t={t}
                                          isSelected={selectedActivity === id}
                                          onActivityAdded={onAddActivityModalOpenEC}
                                        />
                                      ))}
                                    </Box>
                                  )}
                                </Box>
                              </Box>
                            ) : (
                              <Box>
                                {isUnavailableChecked ? (
                                  <Box>
                                    <HeadingText title={t("scope-unavailable")} />
                                    <Text
                                      letterSpacing="wide"
                                      fontSize="body.lg"
                                      fontWeight="normal"
                                      color="interactive.control"
                                      mt="8px"
                                    >
                                      {t("scope-unavailable-description")}
                                    </Text>
                                    <Box mt="48px">
                                      <Text
                                        fontWeight="bold"
                                        fontSize="title.md"
                                        fontFamily="heading"
                                        pt="48px"
                                        pb="24px"
                                      >
                                        {t("select-reason")}
                                      </Text>
                                      <RadioGroup>
                                        <Stack direction="column">
                                          <Radio
                                            value={t("select-reason-1")}
                                            color="interactive.secondary"
                                          >
                                            {t("select-reason-1")}
                                          </Radio>
                                          <Radio value={t("select-reason-2")}>
                                            {t("select-reason-2")}
                                          </Radio>
                                          <Radio value={t("select-reason-3")}>
                                            {t("select-reason-3")}
                                          </Radio>
                                          <Radio value={t("select-reason-4")}>
                                            {t("select-reason-4")}
                                          </Radio>
                                        </Stack>
                                      </RadioGroup>
                                      <Text
                                        fontWeight="medium"
                                        fontSize="title.md"
                                        fontFamily="heading"
                                        pt="48px"
                                        pb="24px"
                                        letterSpacing="wide"
                                      >
                                        {t("explanation-justification")}
                                      </Text>
                                      <Textarea
                                        borderRadius="4px"
                                        borderWidth="1px"
                                        borderColor="border.neutral"
                                        backgroundColor="base.light"
                                        placeholder={t("textarea-placeholder-text")}
                                      />
                                      <Button h="48px" p="16px" mt="24px">
                                        {t("save-changes")}
                                      </Button>
                                    </Box>
                                  </Box>
                                ) : (
                                  <Box>
                                    <Text
                                      letterSpacing="wide"
                                      fontSize="body.lg"
                                      fontWeight="normal"
                                      color="interactive.control"
                                    >
                                      <Trans
                                        t={t}
                                        i18nKey="add-data-manually-desciption"
                                      >
                                        To add your inventory data manually, select
                                        the methodology used to collect the data and
                                        calculate your emissions.{" "}
                                        <Link
                                          href="/"
                                          color="content.link"
                                          fontWeight="bold"
                                          textDecoration="underline"
                                        >
                                          Learn more
                                        </Link>{" "}
                                        about methodologies
                                      </Trans>
                                    </Text>
                                    <Text
                                      fontWeight="bold"
                                      fontSize="title.md"
                                      fontFamily="heading"
                                      pt="48px"
                                      pb="24px"
                                    >
                                      {t("select-methodology")}
                                    </Text>
                                    <Box
                                      gap="16px"
                                      display="flex"
                                      justifyContent="space-between"
                                    >
                                      {METHODOLOGIES.map(
                                        ({
                                          methodologyId,
                                          name,
                                          description,
                                          inputRequired,
                                          disabled,
                                        }) => (
                                          <MethodologyCard
                                            methodologyId={methodologyId}
                                            key={name}
                                            name={name}
                                            description={description}
                                            inputRequired={inputRequired}
                                            isSelected={selectedMethodology === name}
                                            disabled={disabled}
                                            t={t}
                                            handleCardSelect={handleMethodologySelected}
                                          />
                                        ),
                                      )}
                                    </Box>
                                  </Box>
                                )}
                              </Box>
                            )}
                          </Box>
                    )}
                        </Box>
                      )}
                    {hasActivityData && (
                          <Box
                            w="full"
                            borderTopWidth="3px"
                            borderColor="interactive.secondary"
                            py="32px"
                            px="48px"
                            bottom="0px"
                            bg="base.light"
                          >
                            <Box display="flex" justifyContent="space-between">
                              <Text
                                fontFamily="heading"
                                fontWeight="semibold"
                                fontSize="headline.md"
                              >
                                {t("total-emissions")}
                              </Text>
                              <Text
                                fontFamily="heading"
                                fontWeight="semibold"
                                fontSize="headline.md"
                              >
                                {totalEmissions} MtCO2
                              </Text>
                            </Box>
                          </Box>
                        )}
              </TabPanel>
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
    </Box>
  );
}

export default SubSectorPage;
