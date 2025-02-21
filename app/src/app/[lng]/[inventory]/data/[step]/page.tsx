"use client";

import { SegmentedProgress } from "@/components/SegmentedProgress";
import FileInput from "@/components/file-input";
import {
  CircleIcon,
  DataCheckIcon,
  ExcelFileIcon,
  MissingDataIcon,
  NoDatasourcesIcon,
} from "@/components/icons";
import {
  clear,
  InventoryUserFileAttributes,
  removeFile,
} from "@/features/city/inventoryDataSlice";
import { useTranslation } from "@/i18n/client";
import { RootState } from "@/lib/store";
import { api } from "@/services/api";
import { logger } from "@/services/logger";
import {
  bytesToMB,
  convertSectorReferenceNumberToNumber,
  nameToI18NKey,
} from "@/util/helpers";
import type { DataSourceResponse, SectorProgress } from "@/util/types";

import {
  Badge,
  Box,
  Card,
  Center,
  Flex,
  Heading,
  HStack,
  Icon,
  IconButton,
  Link,
  ProgressCircle,
  SimpleGrid,
  Spinner,
  Stack,
  TagLabel,
  Text,
  useDisclosure,
  useSteps,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useState } from "react";
import { Trans } from "react-i18next/TransWithoutContext";
import { FiTarget, FiTrash2 } from "react-icons/fi";
import {
  MdAdd,
  MdArrowBack,
  MdArrowDropDown,
  MdArrowDropUp,
  MdCheckCircle,
  MdChevronRight,
  MdHomeWork,
  MdOutlineCheckCircle,
  MdOutlineEdit,
  MdRefresh,
  MdSearch,
  MdWarning,
} from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { SourceDrawer } from "./SourceDrawer";
import type {
  DataSourceWithRelations,
  DataStep,
  SubSectorWithRelations,
} from "./types";

import { InventoryValueAttributes } from "@/models/InventoryValue";
import { motion } from "framer-motion";
import { getTranslationFromDict } from "@/i18n";
import { getScopesForInventoryAndSector, SECTORS } from "@/util/constants";
import { Button } from "@/components/ui/button";
import { toaster } from "@/components/ui/toaster";
import {
  BreadcrumbCurrentLink,
  BreadcrumbLink,
  BreadcrumbRoot,
} from "@/components/ui/breadcrumb";
import { Tag } from "@/components/ui/tag";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import { TbWorldSearch } from "react-icons/tb";
import AddFileDataDialog from "@/components/Modals/add-file-data-dialog";

function getMailURI(locode?: string, sector?: string, year?: number): string {
  const emails =
    process.env.NEXT_PUBLIC_SUPPORT_EMAILS ||
    "info@openearth.org,greta@openearth.org";
  return `mailto://${emails}?subject=Missing third party data sources&body=City: ${locode}%0ASector: ${sector}%0AYear: ${year}`;
}

const kebab = (str: string) =>
  str
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^0-9A-Za-z\-\_]/g, "")
    .toLowerCase();

function SearchDataSourcesPrompt({
  t,
  isSearching,
  isDisabled = false,
  onSearchClicked,
}: {
  t: TFunction;
  isSearching: boolean;
  isDisabled?: boolean;
  onSearchClicked: () => void;
}) {
  return (
    <Flex align="center" direction="column">
      <Icon
        as={TbWorldSearch}
        boxSize={20}
        color="interactive.secondary"
        borderRadius="full"
        p={3}
        bgColor="background.neutral"
        mb={6}
      />
      <Button
        variant="solid"
        loading={isSearching}
        disabled={isDisabled}
        loadingText={t("searching")}
        onClick={onSearchClicked}
        mb={2}
        px={6}
        h={16}
        py={4}
      >
        <Icon as={MdSearch} boxSize={6} />
        {t("search-available-datasets")}
      </Button>
      <Text color="content.tertiary" textAlign="center" fontSize="sm">
        {t("wait-for-search")}
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
      <Box borderRadius="full" p={4} bgColor="background.neutral" mb={6}>
        <Icon
          as={NoDatasourcesIcon}
          boxSize={20}
          color="interactive.secondary"
        />
      </Box>
      <Heading
        size="lg"
        color="interactive.secondary"
        mb={2}
        textAlign="center"
      >
        {t("no-data-sources")}
      </Heading>
      <Text color="content.tertiary" textAlign="center" fontSize="sm">
        <Trans t={t} i18nKey="no-data-sources-description">
          I<br />I
          <Link
            href={getMailURI(locode, sector, year)}
            className="underline"
            color="content.link"
            fontWeight="bold"
          >
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

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  const {
    data: inventoryProgress,
    isLoading: isInventoryProgressLoading,
    error: inventoryProgressError,
  } = api.useGetInventoryProgressQuery(inventory);
  const isInventoryLoading = isUserInfoLoading || isInventoryProgressLoading;
  const locode = inventoryProgress?.inventory.city.locode || undefined;
  const year = inventoryProgress?.inventory.year || undefined;

  const [
    loadDataSources,
    {
      data,
      isLoading: areDataSourcesLoading,
      isFetching: areDataSourcesFetching,
      error: dataSourcesError,
    },
  ] = api.useLazyGetAllDataSourcesQuery();

  const [connectDataSource, { isLoading: isConnectDataSourceLoading }] =
    api.useConnectDataSourceMutation();

  const [steps, setSteps] = useState<DataStep[]>(
    SECTORS.map((s) => ({
      ...s,
      connectedProgress: 0,
      addedProgress: 0,
      totalSubSectors: 0,
      sector: null,
      subSectors: null,
    })),
  );

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

  const { value: activeStep, goToNextStep: goToNext } = useSteps({
    defaultStep: Number(step) - 1,
    count: steps.length,
  });

  const currentStep = steps[activeStep];

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
  let dataSources: DataSourceResponse | undefined;
  if (data) {
    const { data: successfulSources, failedSources, removedSources } = data;
    dataSources = successfulSources?.filter(({ source, data }) => {
      const referenceNumber =
        source.subCategory?.referenceNumber ||
        source.subSector?.referenceNumber;
      if (!data || !referenceNumber) return false;
      const sectorReferenceNumber = referenceNumber.split(".")[0];

      return sectorReferenceNumber === currentStep.referenceNumber;
    });
  }

  const [selectedSource, setSelectedSource] =
    useState<DataSourceWithRelations>();
  const [selectedSourceData, setSelectedSourceData] = useState<any>();
  const {
    open: isSourceDrawerOpen,
    onClose: onSourceDrawerClose,
    onOpen: onSourceDrawerOpen,
  } = useDisclosure();
  const onSourceClick = (source: DataSourceWithRelations, data: any) => {
    setSelectedSource(source);
    setSelectedSourceData(data);
    onSourceDrawerOpen();
  };

  const showError = (title: string, description: string) => {
    toaster.error({
      title,
      description,
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
      toaster.error({
        title: t("data-source-connect-failed"),
        description: error.data?.error?.message,
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

  async function onSearchDataSourcesClicked() {
    const { data, removedSources, failedSources } = await loadDataSources({
      inventoryId: inventory,
    }).unwrap();

    // this is printed to debug missing data sources more easily,
    // TODO consider putting this behind a "dev mode" flag of some kind
    if (removedSources.length > 0) {
      console.info("Removed data sources");
      console.dir(removedSources);
    }
    if (failedSources.length > 0) {
      console.info("Failed data sources");
      console.dir(failedSources);
    }
  }

  const [selectedSubsector, setSelectedSubsector] =
    useState<SubSectorWithRelations>();
  const {
    open: isSubsectorDrawerOpen,
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
    open: isfileDataModalOpen,
    onOpen: onFileDataModalOpen,
    onClose: onfileDataModalClose,
  } = useDisclosure();

  const [uploadedFile, setUploadedFile] = useState<File>();

  const [openFileUploadDialog, setOpenFileUploadDialog] = useState(false);

  const handleFileSelect = async (file: File) => {
    setOpenFileUploadDialog((v) => !v);
  };

  const sectorData = getInventoryData.sectors.filter(
    (sector) => sector.sectorName === currentStep.name,
  );

  const [deleteUserFile, { isLoading }] = api.useDeleteUserFileMutation();

  function removeSectorFile(
    fileId: string,
    sectorName: string,
    cityId: string,
  ) {
    deleteUserFile({ fileId, cityId }).then((res: any) => {
      if (res.error) {
        toaster.error({
          title: t("file-deletion-error"),
          description: t("file-deletion-error-description"),
          duration: 2000,
        });
      } else {
        toaster.success({
          title: t("file-deletion-success"),
          description: t("file-deletion-success"),
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
              datasourceId: inventoryValue.datasourceId,
            });
          },
        ),
      );
      // TODO show alert
      setDisconnectingDataSourceId(null);
      onSearchDataSourcesClicked();
    } else {
      console.error("Something went wrong when disconnecting data source");
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

  const MotionBox = motion(
    // the display name is added below, but the linter isn't picking it up
    // eslint-disable-next-line react/display-name
    forwardRef<HTMLDivElement, any>((props, ref) => (
      <Box ref={ref} {...props} />
    )),
  );
  MotionBox.displayName = "MotionBox";

  const scrollResizeHeaderThreshold = 50;
  const isExpanded = scrollPosition > scrollResizeHeaderThreshold;

  return (
    <>
      <Box id="top" />
      <Box
        bg="background.backgroundLight"
        borderColor="border.neutral"
        borderBottomWidth={isExpanded ? "1px" : ""}
        className={`fixed z-10 top-0 w-full ${isExpanded ? "pt-[0px] h-[200px]" : "pt-[120px] h-[400px]"} transition-all duration-50 ease-linear`}
      >
        <div className=" w-[1090px] mx-auto px-4  ">
          <Box
            w="full"
            display="flex"
            alignItems="center"
            gap="16px"
            mb="28px"
            className={` ${isExpanded ? "hidden" : "flex"} transition-all duration-50 ease-linear`}
          >
            <Button
              variant="ghost"
              fontSize="14px"
              color="content.link"
              fontWeight="bold"
              onClick={() => router.push(`/${inventory}/data`)}
            >
              <Icon as={MdArrowBack} boxSize={6} />
              {t("go-back")}
            </Button>
            <Box borderRightWidth="1px" borderColor="border.neutral" h="24px" />
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
                <BreadcrumbLink
                  href={`/${inventory}/data`}
                  color="content.tertiary"
                >
                  {t("all-sectors")}
                </BreadcrumbLink>

                <BreadcrumbCurrentLink
                  color="content.link"
                  textDecoration="underline"
                >
                  {t(kebab(currentStep.name || ""))}
                </BreadcrumbCurrentLink>
              </BreadcrumbRoot>
            </Box>
          </Box>
          {/*** Sector summary section ***/}
          <Box
            mb={12}
            shadow="none"
            bg="none"
            gap="16px"
            flexDir="row"
            w="full"
            border="none"
            px={0}
          >
            {scrollPosition <= 0 ? (
              ""
            ) : (
              <Box>
                <Link href="#">
                  <Icon
                    as={MdArrowBack}
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
                  fontSize={isExpanded ? "headline.sm" : "headline.md"}
                >
                  {t(kebab(currentStep.name))}
                </Heading>
                {scrollPosition <= 0 ? (
                  <Text color="content.tertiary">
                    {t(currentStep.description)}
                  </Text>
                ) : (
                  <Box w="800px"></Box>
                )}
                <Text fontWeight="bold" ml={isExpanded ? "-48px" : ""}>
                  {t("inventory-year")}: {inventoryProgress?.inventory.year} |{" "}
                  {t("gpc-scope-required")}{" "}
                  {inventoryProgress?.inventory.inventoryType &&
                    getScopesForInventoryAndSector(
                      inventoryProgress.inventory.inventoryType!,
                      currentStep.referenceNumber,
                    )?.join(", ")}
                </Text>
                <Flex direction="row" ml={isExpanded ? "-48px" : ""}>
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
                    <Badge mr={4}>
                      <Icon
                        as={CircleIcon}
                        boxSize={6}
                        color="interactive.quaternary"
                      />
                      {t("data-connected-percent", {
                        progress: formatPercentage(
                          currentStep.connectedProgress,
                        ),
                      })}
                    </Badge>
                    <Badge>
                      <Icon
                        as={CircleIcon}
                        boxSize={6}
                        color="interactive.tertiary"
                      />
                      {t("data-added-percent", {
                        progress: formatPercentage(currentStep.addedProgress),
                      })}
                    </Badge>
                  </>
                ) : (
                  ""
                )}
              </div>
            </Flex>
          </Box>
        </div>
      </Box>
      <div className="pt-[48px] pb-16 w-[1090px] max-w-full mx-auto px-4">
        {/*** Manual data entry section for subsectors ***/}
        <Card.Root mb={24} mt="350px" shadow="none" border="none">
          <Card.Body>
            <Heading fontSize="title.lg" mb={2}>
              {t("add-data-heading")}
            </Heading>
            <Text color="content.tertiary" mb={12}>
              {t("add-data-details")}
            </Text>
            <Heading size="sm" mb={4}>
              {t("select-subsector")}
            </Heading>
            <SimpleGrid minChildWidth="337px" gap={4}>
              {isInventoryLoading || !currentStep.subSectors ? (
                <Center>
                  <Spinner size="lg" />
                </Center>
              ) : inventoryProgressError ? (
                <Center>
                  <Icon as={MdWarning} boxSize={8} color="semantic.danger" />
                </Center>
              ) : (
                currentStep.subSectors.map(
                  (subSector: SubSectorWithRelations) => (
                    <Card.Root
                      data-testid="subsector-card"
                      maxHeight="120px"
                      w="full"
                      height="100px"
                      px={4}
                      className="shadow-none border border-overlay hover:drop-shadow-xl !duration-300 transition-shadow"
                      onClick={() => {
                        router.push(
                          `/${inventory}/data/${convertSectorReferenceNumberToNumber(currentStep.referenceNumber)}/${subSector.subsectorId}?refNo=${subSector.referenceNumber}`,
                        );
                      }}
                      key={subSector.subsectorId}
                    >
<<<<<<< HEAD
                      {subSector.completedCount > 0 &&
                      subSector.completedCount < subSector.totalCount ? (
                        <ProgressCircleRoot
                          css={{ "--thickness": "12px" }}
                          mr="4"
                          color="interactive.secondary"
                          bgColor="none"
                          value={
                            (subSector.completedCount / subSector.totalCount) *
                            100
                          }
                        >
                          <ProgressCircle.Circle>
                            <ProgressCircle.Track />
                            <ProgressCircle.Range stroke="content.link" />
                          </ProgressCircle.Circle>
                        </ProgressCircleRoot>
                      ) : (
                        <Icon
                          as={
                            subSector.completed
                              ? MdOutlineCheckCircle
                              : MissingDataIcon
                          }
                          boxSize={10}
=======
                      <HStack
                        align="center"
                        height="120px"
                        justify="space-between"
                      >
                        {subSector.completedCount > 0 &&
                        subSector.completedCount < subSector.totalCount ? (
                          <ProgressCircleRoot
                            size="xs"
                            mr={1}
                            value={
                              (subSector.completedCount /
                                subSector.totalCount) *
                              100
                            }
                          >
                            <ProgressCircleRing />
                          </ProgressCircleRoot>
                        ) : (
                          <Icon
                            as={
                              subSector.completed
                                ? MdOutlineCheckCircle
                                : MissingDataIcon
                            }
                            boxSize={10}
                            color={
                              subSector.completed
                                ? "interactive.tertiary"
                                : "sentiment.warningDefault"
                            }
                          />
                        )}
                        <Stack w="full">
                          <Heading
                            fontSize="label.lg"
                            maxWidth="200px"
                            lineClamp="2"
                            lineHeight="20px"
                            title={t(nameToI18NKey(subSector.subsectorName!))}
                          >
                            {t(nameToI18NKey(subSector.subsectorName!))}
                          </Heading>
                          {subSector.scope && (
                            <Text color="content.tertiary">
                              {t("scope")}: {subSector.scope.scopeName}
                            </Text>
                          )}
                        </Stack>
                        <IconButton
                          bg="background.neutral"
>>>>>>> develop
                          color={
                            subSector.completed
                              ? "interactive.tertiary"
                              : "content.link"
                          }
                          aria-label={
                            subSector.completed
                              ? t("edit-subsector")
                              : t("add-subsector-data")
                          }
                          _hover={{
                            color: "base.light",
                          }}
                          variant="solid"
                        >
<<<<<<< HEAD
                          {t(nameToI18NKey(subSector.subsectorName!))}
                        </Heading>
                        {subSector.scope && (
                          <Text color="content.tertiary">
                            {t("scope")}: {subSector.scope.scopeName}
                          </Text>
                        )}
                      </Stack>
                      <IconButton
                        bg="background.neutral"
                        color={"content.link"}
                        aria-label={
                          subSector.completed
                            ? t("edit-subsector")
                            : t("add-subsector-data")
                        }
                        _hover={{
                          bg: "base.light",
                        }}
                        variant="solid"
                      >
                        <Icon
                          as={subSector.completed ? MdOutlineEdit : MdAdd}
                          boxSize={6}
                        />
                      </IconButton>
                    </HStack>
                  </Card.Root>
                ),
              )
            )}
          </SimpleGrid>
=======
                          <Icon
                            as={subSector.completed ? MdOutlineEdit : MdAdd}
                            boxSize={6}
                          />
                        </IconButton>
                      </HStack>
                    </Card.Root>
                  ),
                )
              )}
            </SimpleGrid>
          </Card.Body>
>>>>>>> develop
        </Card.Root>
        {/*** Third party data source section ***/}
        <Card.Root mb={24} shadow="none" border="none">
          <Card.Body>
            <Flex
              align="center"
              verticalAlign="center"
              justify="space-between"
              mb={12}
            >
              <Stack>
                <Heading fontSize="title.lg" mb={2}>
                  {t("check-data-heading")}
                </Heading>
                <Text color="content.tertiary">{t("check-data-details")}</Text>
              </Stack>
              {dataSources && (
                <IconButton
                  variant="solid"
                  aria-label="Refresh"
                  size="lg"
                  h={16}
                  w={16}
                  loading={areDataSourcesFetching}
                  onClick={onSearchDataSourcesClicked}
                >
                  <Icon as={MdRefresh} boxSize={9} />
                </IconButton>
              )}
            </Flex>
            {!dataSources ? (
              <SearchDataSourcesPrompt
                t={t}
                isSearching={areDataSourcesLoading}
                onSearchClicked={onSearchDataSourcesClicked}
              />
            ) : dataSourcesError ? (
              <Center>
                <Icon as={MdWarning} boxSize={8} color="semantic.danger" />
              </Center>
            ) : dataSources && dataSources?.length === 0 ? (
              <NoDataSourcesMessage
                t={t}
                sector={currentStep.referenceNumber}
                locode={locode}
                year={year}
              />
            ) : (
              <SimpleGrid columns={3} gap={4}>
                {dataSources
                  .slice(0, isDataSectionExpanded ? dataSources.length : 6)
                  .map(({ source, data }) => {
                    const isHovered = hoverStates[source.datasourceId];
                    const { variant, text, icon } = getButtonProps(
                      source,
                      isHovered,
                    );

                    return (
                      <Card.Root
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
                        <Heading size="sm" lineClamp={2} minHeight={10}>
                          {getTranslationFromDict(source.datasetName)}
                        </Heading>
                        <Flex direction="row" my={4} wrap="wrap" gap={2}>
                          <Tag
                            startElement={
                              <Icon
                                as={DataCheckIcon}
                                boxSize={5}
                                color="content.tertiary"
                              />
                            }
                          >
                            <TagLabel fontSize={11}>
                              {t("data-quality")}:{" "}
                              {t("quality-" + source.dataQuality)}
                            </TagLabel>
                          </Tag>
                          {source.subCategory?.scope && (
                            <Tag
                              startElement={
                                <Icon
                                  as={FiTarget}
                                  boxSize={4}
                                  color="content.tertiary"
                                />
                              }
                            >
                              <TagLabel fontSize={11}>
                                {t("scope")}:{" "}
                                {source.subCategory.scope.scopeName}
                              </TagLabel>
                            </Tag>
                          )}
                        </Flex>
                        <Text
                          color="content.tertiary"
                          lineClamp={5}
                          minHeight={120}
                        >
                          {getTranslationFromDict(source.datasetDescription) ||
                            getTranslationFromDict(
                              source.methodologyDescription,
                            )}
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
                            variant="solid"
                            px={6}
                            py={4}
                            onClick={() => onDisconnectThirdPartyData(source)}
                            loading={
                              isDisconnectLoading &&
                              source.datasourceId === disconnectingDataSourceId
                            }
                            onMouseEnter={() => onButtonHover(source)}
                            onMouseLeave={() => onMouseLeave(source)}
                          >
                            <Icon as={MdCheckCircle} />
                            {text}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            bgColor="background.neutral"
                            onClick={() => onConnectClick(source)}
                            loading={
                              isConnectDataSourceLoading &&
                              source.datasourceId === connectingDataSourceId
                            }
                          >
                            {t("connect-data")}
                          </Button>
                        )}
                      </Card.Root>
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
              >
                {t(isDataSectionExpanded ? "less-datasets" : "more-datasets")}
                <Icon
                  boxSize={6}
                  as={isDataSectionExpanded ? MdArrowDropUp : MdArrowDropDown}
                />
              </Button>
            )}
          </Card.Body>
        </Card.Root>
        {/* Upload own data section */}
        <Card.Root mb={24} shadow="none" border="none" w="full">
          <Card.Body>
            <Heading fontSize="title.lg" mb={2}>
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
                            <Card.Root
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
                              <Card.Body>
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
                                      truncate
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
                                  {file.subsectors
                                    ?.split(",")
                                    .map((item: any) => (
                                      <Tag
                                        key={item}
                                        mt={2}
                                        mr={2}
                                        size="md"
                                        variant="solid"
                                        color="content.alternative"
                                        bg="background.neutral"
                                        maxW="150px"
                                      >
                                        <TagLabel>{item}</TagLabel>
                                      </Tag>
                                    ))}
                                </Box>
                              </Card.Body>
                            </Card.Root>
                          );
                        },
                      )}
                  </Box>
                </Box>
              </Box>
            </Box>
          </Card.Body>
        </Card.Root>
        {/* Add fole data modal */}
        <AddFileDataDialog
          isOpen={openFileUploadDialog}
          onClose={onfileDataModalClose}
          subsectors={currentStep.subSectors}
          onOpenChange={setOpenFileUploadDialog}
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
          sector={currentStep.sector ?? undefined}
          isOpen={isSourceDrawerOpen}
          onClose={onSourceDrawerClose}
          onConnectClick={() => onConnectClick(selectedSource!)}
          isConnectLoading={isConnectDataSourceLoading}
          t={t}
          inventoryId={inventory}
        />
      </div>
    </>
  );
}
