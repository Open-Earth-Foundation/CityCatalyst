"use client";

import { SegmentedProgress } from "@/components/SegmentedProgress";
import FileInput from "@/components/file-input";
import {
  CircleIcon,
  DataAlertIcon,
  DataCheckIcon,
  ExcelFileIcon,
  SearchOffIcon,
  WorldSearchIcon,
} from "@/components/icons";
import WizardSteps from "@/components/wizard-steps";
import {
  InventoryUserFileAttributes,
  addFile,
  clear,
  removeFile,
} from "@/features/city/inventoryDataSlice";
import { setSubsector, clearSubsector } from "@/features/city/subsectorSlice";
import { useTranslation } from "@/i18n/client";
import { RootState } from "@/lib/store";
import { ScopeAttributes } from "@/models/Scope";
import { api } from "@/services/api";
import { logger } from "@/services/logger";
import { bytesToMB, nameToI18NKey } from "@/util/helpers";
import type { SectorProgress } from "@/util/types";
import {
  ArrowBackIcon,
  ChevronRightIcon,
  SearchIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  Card,
  Center,
  CircularProgress,
  Flex,
  HStack,
  Heading,
  Icon,
  IconButton,
  Link,
  SimpleGrid,
  Spinner,
  Stack,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  useDisclosure,
  useSteps,
  useToast,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Trans } from "react-i18next/TransWithoutContext";
import { FiTarget, FiTrash2, FiTruck } from "react-icons/fi";
import {
  MdAdd,
  MdArrowDropDown,
  MdArrowDropUp,
  MdCheckCircle,
  MdHomeWork,
  MdOutlineCheckCircle,
  MdOutlineEdit,
  MdOutlineHomeWork,
  MdOutlineSkipNext,
  MdRefresh,
} from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { SourceDrawer } from "./SourceDrawer";
import { SubsectorDrawer } from "./SubsectorDrawer";
import type {
  DataSourceWithRelations,
  DataStep,
  SubSectorWithRelations,
} from "./types";

import AddFileDataModal from "@/components/Modals/add-file-data-modal";
import { InventoryValueAttributes } from "@/models/InventoryValue";
import { UserFileAttributes } from "@/models/UserFile";
import { motion } from "framer-motion";

function getMailURI(locode?: string, sector?: string, year?: number): string {
  const emails =
    process.env.NEXT_PUBLIC_SUPPORT_EMAILS ||
    "info@openearth.org,greta@openearth.org";
  return `mailto://${emails}?subject=Missing third party data sources&body=City: ${locode}%0ASector: ${sector}%0AYear: ${year}`;
}

function SearchDataSourcesPrompt({
  t,
  isSearching,
  isDisabled,
  onSearchClicked,
}: {
  t: TFunction;
  isSearching: boolean;
  isDisabled: boolean;
  onSearchClicked: () => void;
}) {
  return (
    <Flex align="center" direction="column">
      <Box p="16px" mb="24px" borderRadius="full" bg="background.neutral">
        <SearchOffIcon />
      </Box>
      <Text
        fontFamily="heading"
        fontSize="title.lg"
        fontWeight="600"
        color="interactive.control"
      >
        No External Data Sources Available
      </Text>
      <Text
        color="content.tertiary"
        align="center"
        size="sm"
        variant="spaced"
        w="550px"
        mt="8px"
      >
        <Text>{t("no-external-sources")}</Text>
        <Text fontWeight="semibold">
          <Trans t={t} i18nKey="report-any-sources">
            if you know any,{" "}
            <Link href="/" color="content.link" textDecor="underline">
              please report this
            </Link>{" "}
            and we&apos;ll prioritize your request.
          </Trans>
        </Text>
      </Text>
    </Flex>
  );
}

function NoDataSourcesMessage({
  t,
  locode,
  sector,
  year,
}: {
  t: TFunction;
  locode?: string;
  sector?: string;
  year?: number;
}) {
  return (
    <Flex align="center" direction="column">
      <Icon
        as={WorldSearchIcon}
        boxSize={20}
        color="interactive.secondary"
        borderRadius="full"
        p={4}
        bgColor="background.neutral"
        mb={6}
      />
      <Heading
        size="lg"
        color="interactive.secondary"
        mb={2}
        textAlign="center"
      >
        {t("no-data-sources")}
      </Heading>
      <Text color="content.tertiary" align="center" size="sm">
        <Trans t={t} i18nKey="no-data-sources-description">
          I<br />I
          <Link href={getMailURI(locode, sector, year)} className="underline">
            please report this
          </Link>
          I
        </Trans>
      </Text>
    </Flex>
  );
}

export default function AddDataSteps({
  params: { lng, step, inventory },
}: {
  params: { lng: string; step: string; inventory: string };
}) {
  const { t } = useTranslation(lng, "data");
  const router = useRouter();
  const toast = useToast();

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
  const isInventoryLoading = isUserInfoLoading || isInventoryProgressLoading;
  const locode = inventoryProgress?.inventory.city.locode || undefined;
  const year = inventoryProgress?.inventory.year || undefined;

  const [
    loadDataSources,
    {
      data: allDataSources,
      isLoading: areDataSourcesLoading,
      isFetching: areDataSourcesFetching,
      error: dataSourcesError,
    },
  ] = api.useLazyGetAllDataSourcesQuery();

  const [connectDataSource, { isLoading: isConnectDataSourceLoading }] =
    api.useConnectDataSourceMutation();

  const [steps, setSteps] = useState<DataStep[]>([
    {
      title: t("stationary-energy"),
      details: t("stationary-energy-details"),
      icon: MdOutlineHomeWork,
      connectedProgress: 0,
      addedProgress: 0,
      totalSubSectors: 0,
      referenceNumber: "I",
      sector: null,
      subSectors: null,
    },
    {
      title: t("transportation"),
      details: t("transportation-details"),
      icon: FiTruck,
      connectedProgress: 0,
      addedProgress: 0,
      totalSubSectors: 0,
      referenceNumber: "II",
      sector: null,
      subSectors: null,
    },
    {
      title: t("waste"),
      details: t("waste-details"),
      icon: FiTrash2,
      connectedProgress: 0,
      addedProgress: 0,
      totalSubSectors: 0,
      referenceNumber: "III",
      sector: null,
      subSectors: null,
    },
  ]);

  useEffect(() => {
    if (inventoryProgress == null) {
      return;
    }

    const progress = inventoryProgress.sectorProgress;
    const updatedSteps = steps.map((step) => {
      const sectorProgress: SectorProgress | undefined = progress.find(
        (p) => p.sector.referenceNumber === step.referenceNumber,
      );
      if (!sectorProgress) {
        console.error(
          "No progress entry found for sector",
          step.referenceNumber,
        );
        return step;
      }
      step.sector = sectorProgress.sector;
      step.subSectors = sectorProgress.subSectors;
      step.totalSubSectors = sectorProgress.total;
      if (sectorProgress.total === 0) {
        return step;
      }
      const connectedProgress =
        sectorProgress.thirdParty / sectorProgress.total;
      const addedProgress = sectorProgress.uploaded / sectorProgress.total;
      step.connectedProgress = Math.max(
        connectedProgress,
        step.connectedProgress,
      );
      step.addedProgress = Math.max(addedProgress, step.addedProgress);
      return step;
    });
    setSteps(updatedSteps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryProgress]);

  const { activeStep, goToNext, setActiveStep } = useSteps({
    index: Number(step) - 1,
    count: steps.length,
  });
  const currentStep = steps[activeStep];
  const onStepSelected = (selectedStep: number) => {
    setActiveStep(selectedStep);
  };
  useEffect(() => {
    // change step param in URL without reloading
    const newPath = location.pathname.replace(
      /\/[0-9]+$/,
      `/${activeStep + 1}`,
    );
    history.replaceState(null, "", newPath);
  }, [activeStep]);

  const totalStepCompletion = currentStep
    ? currentStep.connectedProgress + currentStep.addedProgress
    : 0;
  const formatPercentage = (percentage: number) =>
    Math.round(percentage * 1000) / 10;

  // only display data sources relevant to current sector
  const dataSources = allDataSources?.filter(({ source, data }) => {
    const referenceNumber =
      source.subCategory?.referenceNumber || source.subSector?.referenceNumber;
    if (!data || !referenceNumber) return false;
    const sectorReferenceNumber = referenceNumber.split(".")[0];

    return sectorReferenceNumber === currentStep.referenceNumber;
  });

  const [selectedSource, setSelectedSource] =
    useState<DataSourceWithRelations>();
  const [selectedSourceData, setSelectedSourceData] = useState<any>();
  const {
    isOpen: isSourceDrawerOpen,
    onClose: onSourceDrawerClose,
    onOpen: onSourceDrawerOpen,
  } = useDisclosure();
  const onSourceClick = (source: DataSourceWithRelations, data: any) => {
    setSelectedSource(source);
    setSelectedSourceData(data);
    onSourceDrawerOpen();
  };

  const showError = (title: string, description: string) => {
    toast({
      title,
      description,
      status: "error",
      isClosable: true,
    });
  };

  const [connectingDataSourceId, setConnectingDataSourceId] = useState<
    string | null
  >(null);
  const [newlyConnectedDataSourceIds, setNewlyConnectedDataSourceIds] =
    useState<string[]>([]);
  const onConnectClick = async (source: DataSourceWithRelations) => {
    if (!inventoryProgress) {
      console.error(
        "Tried to assign data source while inventory progress was not yet loaded!",
      );
      return;
    }
    logger.debug("Connect source", source);
    setConnectingDataSourceId(source.datasourceId);
    try {
      const response = await connectDataSource({
        inventoryId: inventoryProgress?.inventory.inventoryId,
        dataSourceIds: [source.datasourceId],
      }).unwrap();

      if (response.failed.length > 0) {
        showError(
          t("data-source-connect-failed"),
          t("data-source-connect-load-error"),
        );
        return;
      } else if (response.invalid.length > 0) {
        showError(
          t("data-source-connect-failed"),
          t("data-source-connect-invalid-error"),
        );
        return;
      }

      if (response.successful.length > 0) {
        setNewlyConnectedDataSourceIds(
          newlyConnectedDataSourceIds.concat(response.successful),
        );
        onSourceDrawerClose();
      }
    } catch (error: any) {
      console.error("Failed to connect data source", source, error);
      toast({
        title: t("data-source-connect-failed"),
        description: error.data?.error?.message,
        status: "error",
        isClosable: true,
      });
    } finally {
      setConnectingDataSourceId(null);
      onSearchDataSourcesClicked();
    }
  };

  function isSourceConnected(source: DataSourceWithRelations): boolean {
    return (
      (source.inventoryValues && source.inventoryValues.length > 0) ||
      newlyConnectedDataSourceIds.indexOf(source.datasourceId) > -1
    );
  }

  function onSearchDataSourcesClicked() {
    if (inventoryProgress) {
      loadDataSources({ inventoryId: inventoryProgress.inventory.inventoryId });
    } else {
      console.error("Inventory progress is still loading!");
    }
  }

  const [selectedSubsector, setSelectedSubsector] =
    useState<SubSectorWithRelations>();
  const {
    isOpen: isSubsectorDrawerOpen,
    onClose: onSubsectorDrawerClose,
    onOpen: onSubsectorDrawerOpen,
  } = useDisclosure();
  const onSubsectorClick = (subsector: SubSectorWithRelations) => {
    logger.debug(subsector);
    setSelectedSubsector(subsector);
    onSubsectorDrawerOpen();
  };
  const onSubsectorSave = (subsector: SubSectorWithRelations) => {
    logger.debug("Save subsector", subsector);
  };

  const [isConfirming, setConfirming] = useState(false);
  const onConfirm = async () => {
    setConfirming(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setConfirming(false);
    if (activeStep >= steps.length - 1) {
      router.push(`/${inventory}`);
      dispatch(clear());
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      goToNext();
    }
  };

  const onSkip = () => {
    if (activeStep >= steps.length - 1) {
      router.push(`/${inventory}/data/`);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      goToNext();
    }
  };

  const [isDataSectionExpanded, setDataSectionExpanded] = useState(false);

  const getInventoryData = useSelector(
    (state: RootState) => state.inventoryData,
  );
  const dispatch = useDispatch();

  // Add file data to rudux state object
  const {
    isOpen: isfileDataModalOpen,
    onOpen: onFileDataModalOpen,
    onClose: onfileDataModalClose,
  } = useDisclosure();

  const [uploadedFile, setUploadedFile] = useState<File>();

  const handleFileSelect = async (file: File) => {
    onFileDataModalOpen();
  };

  const sectorData = getInventoryData.sectors.filter(
    (sector) => sector.sectorName === currentStep.title,
  );

  const [deleteUserFile, { isLoading }] = api.useDeleteUserFileMutation();

  function removeSectorFile(
    fileId: string,
    sectorName: string,
    cityId: string,
  ) {
    deleteUserFile({ fileId, cityId }).then((res: any) => {
      if (res.error) {
        toast({
          title: t("file-deletion-error"),
          description: t("file-deletion-error-description"),
          status: "error",
          duration: 2000,
        });
      } else {
        toast({
          title: t("file-deletion-success"),
          description: t("file-deletion-success"),
          status: "success",
          duration: 2000,
        });

        dispatch(
          removeFile({
            sectorName,
            fileId,
          }),
        );
      }
    });
  }

  const [buttonText, setButtonText] = useState<string>(t("data-connected"));
  const [hoverStates, setHoverStates] = useState<{ [key: string]: boolean }>(
    {},
  );

  const [disconnectingDataSourceId, setDisconnectingDataSourceId] = useState<
    string | null
  >(null);
  const [disconnectThirdPartyData, { isLoading: isDisconnectLoading }] =
    api.useDisconnectThirdPartyDataMutation();

  const onDisconnectThirdPartyData = async (
    source: DataSourceWithRelations,
  ) => {
    if (isSourceConnected(source)) {
      setDisconnectingDataSourceId(source.datasourceId);
      await Promise.all(
        source.inventoryValues!.map(
          async (inventoryValue: InventoryValueAttributes) => {
            return await disconnectThirdPartyData({
              inventoryId: inventoryValue.inventoryId,
              subCategoryId: inventoryValue.subCategoryId,
            });
          },
        ),
      );
      // TODO show alert
      setDisconnectingDataSourceId(null);
      onSearchDataSourcesClicked();
    } else {
      console.log("Something went wrong");
    }
  };

  const onButtonHover = (source: DataSourceWithRelations) => {
    setHoverStates((prev) => ({ ...prev, [source.datasourceId]: true }));
    setButtonText(t("disconnect-data"));
  };

  const onMouseLeave = (source: DataSourceWithRelations) => {
    setHoverStates((prev) => ({ ...prev, [source.datasourceId]: false }));
    setButtonText(t("data-connected"));
  };

  const DEFAULT_CONNECTED_BUTTON_PROPS = {
    variant: "solidPrimary",
    text: t("data-connected"),
  };

  const DEFAULT_DISCONNECTED_BUTTON_PROPS = {
    variant: "outline",
    text: t("connect-data"),
  };

  const getButtonProps = (
    source: DataSourceWithRelations,
    isHovered: boolean,
  ) => {
    if (isSourceConnected(source)) {
      return {
        variant: isHovered ? "danger" : DEFAULT_CONNECTED_BUTTON_PROPS.variant,
        text: isHovered
          ? t("disconnect-data")
          : DEFAULT_CONNECTED_BUTTON_PROPS.text,
        icon: <Icon as={MdCheckCircle} />,
      };
    } else {
      return {
        variant: DEFAULT_DISCONNECTED_BUTTON_PROPS.variant,
        text: DEFAULT_DISCONNECTED_BUTTON_PROPS.text,
        // Add more properties as needed
      };
    }
  };

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

  const getCurrentStepParam = (currentStepName: string) => {
    switch (currentStepName) {
      case t("stationary-energy"):
        return 1;
      case t("transportation"):
        return 2;
      case t("waste"):
        return 3;
      default:
        return 1;
    }
  };

  const MotionBox = motion(Box);

  return (
    <>
      <Box id="top" />
      <Box
        bg="background.backgroundLight"
        borderColor="border.neutral"
        borderBottomWidth={scrollPosition > 0 ? "1px" : ""}
        className={`fixed z-10 top-0 w-full ${scrollPosition > 0 ? "pt-[0px] h-[200px]" : "pt-[120px] h-[400px]"} transition-all duration-50 ease-linear`}
      >
        <div className=" w-[1090px] mx-auto px-4  ">
          <Box
            w="full"
            display="flex"
            alignItems="center"
            gap="16px"
            mb="28px"
            className={` ${scrollPosition > 0 ? "hidden" : "flex"} transition-all duration-50 ease-linear`}
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
                letterSpacing="widest"
                fontSize="14px"
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
                  <BreadcrumbLink href="#" color="content.link">
                    {currentStep.title}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </Breadcrumb>
            </Box>
          </Box>
          {/*** Sector summary section ***/}
          <Card
            mb={12}
            shadow="none"
            bg="none"
            gap="16px"
            flexDir="row"
            w="full"
            px={0}
          >
            {scrollPosition <= 0 ? (
              ""
            ) : (
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
            )}
            <Flex direction="row" className="w-full">
              <Icon
                as={currentStep.icon}
                boxSize={8}
                color="brand.secondary"
                mr={4}
              />
              <div className="space-y-4 w-[100%]">
                <Heading
                  fontWeight="semibold"
                  textTransform="capitalize"
                  lineHeight="32px"
                  mb={2}
                  className="transition-all duration-50 ease-linear"
                  fontSize={scrollPosition > 0 ? "headline.sm" : "headline.md"}
                >
                  {currentStep.title}
                </Heading>
                {scrollPosition <= 0 ? (
                  <Text color="content.tertiary">{currentStep.details}</Text>
                ) : (
                  <Box w="800px"></Box>
                )}
                <Text fontWeight="bold" ml={scrollPosition > 0 ? "-48px" : ""}>
                  {t("inventory-year")}: 2023 |{" "}
                  {t("gpc-scope-required-summary")} 1,2
                </Text>
                <Flex direction="row" ml={scrollPosition > 0 ? "-48px" : ""}>
                  <SegmentedProgress
                    values={[
                      currentStep.connectedProgress,
                      currentStep.addedProgress,
                    ]}
                    height={4}
                  />
                  <Heading size="sm" ml={6} className="whitespace-nowrap -mt-1">
                    {t("completion-percent", {
                      progress: formatPercentage(totalStepCompletion),
                    })}
                  </Heading>
                </Flex>
                {scrollPosition <= 0 ? (
                  <>
                    <Tag mr={4}>
                      <TagLeftIcon
                        as={CircleIcon}
                        boxSize={6}
                        color="interactive.quaternary"
                      />
                      <TagLabel>
                        {t("data-connected-percent", {
                          progress: formatPercentage(
                            currentStep.connectedProgress,
                          ),
                        })}
                      </TagLabel>
                    </Tag>
                    <Tag>
                      <TagLeftIcon
                        as={CircleIcon}
                        boxSize={6}
                        color="interactive.tertiary"
                      />
                      <TagLabel>
                        {t("data-added-percent", {
                          progress: formatPercentage(currentStep.addedProgress),
                        })}
                      </TagLabel>
                    </Tag>
                  </>
                ) : (
                  ""
                )}
              </div>
            </Flex>
          </Card>
        </div>
      </Box>
      <div className="pt-16 pb-16 w-[1090px] max-w-full mx-auto px-4">
        {/*** Manual data entry section for subsectors ***/}
        <Card mb={12} mt="350px">
          <Heading size="lg" mb={2}>
            {t("add-data-heading")}
          </Heading>
          <Text color="content.tertiary" mb={12}>
            {t("add-data-details")}
          </Text>
          <Heading size="sm" mb={4}>
            {t("select-subsector")}
          </Heading>
          <SimpleGrid minChildWidth="250px" spacing={4}>
            {isInventoryLoading || !currentStep.subSectors ? (
              <Center>
                <Spinner size="lg" />
              </Center>
            ) : inventoryProgressError ? (
              <Center>
                <WarningIcon boxSize={8} color="semantic.danger" />
              </Center>
            ) : (
              currentStep.subSectors.map(
                (subSector: SubSectorWithRelations) => (
                  <Card
                    maxHeight="120px"
                    height="120px"
                    w="full"
                    className="hover:drop-shadow-xl transition-shadow"
                    onClick={() => {
                      router.push(
                        `/${inventory}/data/${getCurrentStepParam(currentStep.title)}/${subSector.subsectorId}`,
                      );
                    }}
                    key={subSector.subsectorId}
                  >
                    <HStack
                      align="center"
                      height="120px"
                      justify="space-between"
                    >
                      {subSector.completedCount > 0 &&
                      subSector.completedCount < subSector.totalCount ? (
                        <CircularProgress
                          size="36px"
                          thickness="12px"
                          mr="4"
                          color="interactive.secondary"
                          trackColor="background.neutral"
                          value={
                            (subSector.completedCount / subSector.totalCount) *
                            100
                          }
                        />
                      ) : (
                        <Icon
                          as={
                            subSector.completed
                              ? MdOutlineCheckCircle
                              : DataAlertIcon
                          }
                          boxSize={9}
                          color={
                            subSector.completed
                              ? "interactive.tertiary"
                              : "sentiment.warningDefault"
                          }
                        />
                      )}
                      <Stack w="full">
                        <Heading size="xs" noOfLines={3} maxWidth="200px">
                          {t(nameToI18NKey(subSector.subsectorName!))}
                        </Heading>
                        {subSector.scope && (
                          <Text color="content.tertiary">
                            {t("scope")}: {subSector.scope.scopeName}
                          </Text>
                        )}
                      </Stack>
                      <IconButton
                        aria-label={t("edit-subsector")}
                        variant="solidIcon"
                        icon={
                          <Icon
                            as={subSector.completed ? MdOutlineEdit : MdAdd}
                            boxSize={6}
                          />
                        }
                      />
                    </HStack>
                  </Card>
                ),
              )
            )}
          </SimpleGrid>
        </Card>
        {/*** Third party data source section ***/}
        <Card mb={12}>
          <Flex
            align="center"
            verticalAlign="center"
            justify="space-between"
            mb={12}
          >
            <Stack>
              <Heading size="lg" mb={2}>
                {t("check-data-heading")}
              </Heading>
              <Text color="content.tertiary" variant="spaced">
                {t("check-data-details")}
              </Text>
            </Stack>
            {dataSources && (
              <IconButton
                variant="solidIcon"
                icon={<Icon as={MdRefresh} boxSize={9} />}
                aria-label="Refresh"
                size="lg"
                h={16}
                w={16}
                isLoading={areDataSourcesFetching}
                onClick={onSearchDataSourcesClicked}
              />
            )}
          </Flex>
          {!dataSources ? (
            <SearchDataSourcesPrompt
              t={t}
              isSearching={areDataSourcesLoading}
              isDisabled={!inventoryProgress}
              onSearchClicked={onSearchDataSourcesClicked}
            />
          ) : dataSourcesError ? (
            <Center>
              <WarningIcon boxSize={8} color="semantic.danger" />
            </Center>
          ) : dataSources && dataSources.length === 0 ? (
            <NoDataSourcesMessage
              t={t}
              sector={currentStep.referenceNumber}
              locode={locode}
              year={year}
            />
          ) : (
            <SimpleGrid columns={3} spacing={4}>
              {dataSources
                .slice(0, isDataSectionExpanded ? dataSources.length : 6)
                .map(({ source, data }) => {
                  const isHovered = hoverStates[source.datasourceId];
                  const { variant, text, icon } = getButtonProps(
                    source,
                    isHovered,
                  );

                  return (
                    <Card
                      key={source.datasourceId}
                      variant="outline"
                      borderColor={
                        isSourceConnected(source) &&
                        source.inventoryValues?.length
                          ? "interactive.tertiary"
                          : ""
                      }
                      borderWidth={2}
                      className="shadow-none hover:drop-shadow-xl transition-shadow"
                    >
                      {/* TODO add icon to DataSource */}
                      <Icon as={MdHomeWork} boxSize={9} mb={6} />
                      <Heading size="sm" noOfLines={2} minHeight={10}>
                        {source.datasetName}
                      </Heading>
                      <Flex direction="row" my={4} wrap="wrap" gap={2}>
                        <Tag>
                          <TagLeftIcon
                            as={DataCheckIcon}
                            boxSize={5}
                            color="content.tertiary"
                          />
                          <TagLabel fontSize={11}>
                            {t("data-quality")}:{" "}
                            {t("quality-" + source.dataQuality)}
                          </TagLabel>
                        </Tag>
                        {source.subCategory?.scope && (
                          <Tag>
                            <TagLeftIcon
                              as={FiTarget}
                              boxSize={4}
                              color="content.tertiary"
                            />
                            <TagLabel fontSize={11}>
                              {t("scope")}: {source.subCategory.scope.scopeName}
                            </TagLabel>
                          </Tag>
                        )}
                      </Flex>
                      <Text
                        color="content.tertiary"
                        noOfLines={5}
                        minHeight={120}
                      >
                        {source.datasetDescription ||
                          source.methodologyDescription}
                      </Text>
                      <Link
                        className="underline"
                        mt={4}
                        mb={6}
                        onClick={() => onSourceClick(source, data)}
                      >
                        {t("see-more-details")}
                      </Link>
                      {isSourceConnected(source) &&
                      source.inventoryValues?.length ? (
                        <Button
                          variant={variant}
                          px={6}
                          py={4}
                          onClick={() => onDisconnectThirdPartyData(source)}
                          isLoading={
                            isDisconnectLoading &&
                            source.datasourceId === disconnectingDataSourceId
                          }
                          onMouseEnter={() => onButtonHover(source)}
                          onMouseLeave={() => onMouseLeave(source)}
                          leftIcon={<Icon as={MdCheckCircle} />}
                        >
                          {text}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          bgColor="background.neutral"
                          onClick={() => onConnectClick(source)}
                          isLoading={
                            isConnectDataSourceLoading &&
                            source.datasourceId === connectingDataSourceId
                          }
                        >
                          {t("connect-data")}
                        </Button>
                      )}
                    </Card>
                  );
                })}
            </SimpleGrid>
          )}
          {dataSources && dataSources.length > 6 && (
            <Button
              variant="ghost"
              color="content.tertiary"
              onClick={() => setDataSectionExpanded(!isDataSectionExpanded)}
              mt={8}
              fontWeight="normal"
              rightIcon={
                <Icon
                  boxSize={6}
                  as={isDataSectionExpanded ? MdArrowDropUp : MdArrowDropDown}
                />
              }
            >
              {t(isDataSectionExpanded ? "less-datasets" : "more-datasets")}
            </Button>
          )}
        </Card>
        {/* Upload own data section */}
        <Card mb={48} shadow="none">
          <Heading size="lg" mb={2}>
            {t("upload-your-data-heading")}
          </Heading>
          <Text color="content.tertiary" mb={12}>
            {t("upload-your-data-details")}
          </Text>
          <Box display="flex">
            <Box w="full">
              <Box w="full">
                <Box mb="24px">
                  <FileInput
                    onFileSelect={handleFileSelect}
                    setUploadedFile={setUploadedFile}
                    t={t}
                  />
                </Box>
                <Box mb="24px">
                  {sectorData[0]?.files.length > 0 ? (
                    <Heading size="sm">{t("files-uploaded")}</Heading>
                  ) : (
                    ""
                  )}
                </Box>
                <Box display="flex" flexDirection="column" gap="8px">
                  {sectorData &&
                    sectorData[0]?.files.map(
                      (file: InventoryUserFileAttributes, i: number) => {
                        return (
                          <Card
                            shadow="none"
                            minH="120px"
                            w="full"
                            borderWidth="1px"
                            borderColor="border.overlay"
                            borderRadius="8px"
                            px="16px"
                            py="16px"
                            key={i}
                          >
                            <Box display="flex" gap="16px">
                              <Box>
                                <ExcelFileIcon />
                              </Box>
                              <Box
                                display="flex"
                                flexDirection="column"
                                justifyContent="center"
                                gap="8px"
                              >
                                <Heading
                                  fontSize="lable.lg"
                                  fontWeight="normal"
                                  letterSpacing="wide"
                                  isTruncated
                                >
                                  {file.fileName}
                                </Heading>
                                <Text
                                  fontSize="body.md"
                                  fontWeight="normal"
                                  color="interactive.control"
                                >
                                  {bytesToMB(file.size ?? 0)}
                                </Text>
                              </Box>
                              <Box
                                color="sentiment.negativeDefault"
                                display="flex"
                                justifyContent="right"
                                alignItems="center"
                                w="full"
                              >
                                <Button
                                  variant="ghost"
                                  color="sentiment.negativeDefault"
                                  onClick={() =>
                                    removeSectorFile(
                                      file.fileId,
                                      sectorData[0].sectorName,
                                      file.cityId,
                                    )
                                  }
                                >
                                  <FiTrash2 size={24} />
                                </Button>
                              </Box>
                            </Box>
                            <Box w="full" className="relative pl-[63px]">
                              {file.subsectors?.split(",").map((item: any) => (
                                <Tag
                                  key={item}
                                  mt={2}
                                  mr={2}
                                  size="md"
                                  borderRadius="full"
                                  variant="solid"
                                  color="content.alternative"
                                  bg="background.neutral"
                                  maxW="150px"
                                >
                                  <TagLabel>{item}</TagLabel>
                                </Tag>
                              ))}
                            </Box>
                          </Card>
                        );
                      },
                    )}
                </Box>
              </Box>
            </Box>
          </Box>
        </Card>
        {/* Add fole data modal */}
        <AddFileDataModal
          isOpen={isfileDataModalOpen}
          onClose={onfileDataModalClose}
          subsectors={currentStep.subSectors}
          t={t}
          uploadedFile={uploadedFile!}
          currentStep={currentStep}
          userInfo={userInfo}
          inventory={inventory}
        />
        {/*** Bottom bar ***/}

        {/*** Drawers ***/}
        <SourceDrawer
          source={selectedSource}
          sourceData={selectedSourceData}
          sector={currentStep.sector}
          isOpen={isSourceDrawerOpen}
          onClose={onSourceDrawerClose}
          onConnectClick={() => onConnectClick(selectedSource!)}
          isConnectLoading={isConnectDataSourceLoading}
          t={t}
        />
        <SubsectorDrawer
          subSector={selectedSubsector}
          sectorName={currentStep.title}
          inventoryId={inventoryProgress?.inventory.inventoryId}
          isOpen={isSubsectorDrawerOpen}
          onClose={onSubsectorDrawerClose}
          onSave={onSubsectorSave}
          t={t}
        />
      </div>
    </>
  );
}
