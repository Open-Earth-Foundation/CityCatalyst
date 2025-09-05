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
  clamp,
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
import { forwardRef, useEffect, useState, use } from "react";
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
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

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
    <Flex
      align="center"
      direction="column"
      data-testid="no-data-sources-message"
    >
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
            textDecoration="underline"
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

export default function AddDataSteps(props: {
  params: Promise<{ lng: string; step: string; inventory: string }>;
}) {
  const { lng, step, inventory } = use(props.params);
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
        logger.error(
          { referenceNumber: step.referenceNumber },
          "No progress entry found for sector",
        );
        return step;
      }
      step.sector = sectorProgress.sector;
      step.subSectors = sectorProgress.subSectors;
      step.totalSubSectors = sectorProgress.total;
      if (sectorProgress.total === 0) {
        return step;
      }
      step.connectedProgress = clamp(
        sectorProgress.thirdParty / sectorProgress.total,
      );
      step.addedProgress = clamp(
        sectorProgress.uploaded / sectorProgress.total,
      );
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
    ? clamp(currentStep.connectedProgress + currentStep.addedProgress)
    : 0;
  const formatPercentage = (percentage: number) =>
    Math.round(percentage * 1000) / 10;

  // only display data sources relevant to current sector
  let dataSources: DataSourceResponse[] | undefined;
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

  const showError = (title: string, description: string, duration?: number) => {
    const { showErrorToast } = UseErrorToast({
      title: t(title),
      description: t(description),
      duration,
    });
    showErrorToast();
  };

  const [connectingDataSourceId, setConnectingDataSourceId] = useState<
    string | null
  >(null);
  const [newlyConnectedDataSourceIds, setNewlyConnectedDataSourceIds] =
    useState<string[]>([]);
  const onConnectClick = async (source: DataSourceWithRelations) => {
    if (!inventoryProgress) {
      logger.error(
        "Tried to assign data source while inventory progress was not yet loaded!",
      );
      return;
    }
    logger.debug({ source }, "Connect source");
    setConnectingDataSourceId(source.datasourceId);
    try {
      const response = await connectDataSource({
        inventoryId: inventoryProgress?.inventory.inventoryId,
        dataSourceIds: [source.datasourceId],
      }).unwrap();

      if (response.failed.length > 0) {
        showError(
          "data-source-connect-failed",
          "data-source-connect-load-error",
        );
        return;
      } else if (response.invalid.length > 0) {
        showError(
          "data-source-connect-failed",
          "data-source-connect-invalid-error",
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
      logger.error(
        { err: error, source: source },
        "Failed to connect data source",
      );
      showError("data-source-connect-failed", error.data?.error?.message);
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
      logger.info("Removed data sources");
      logger.info({ removedSources });
    }
    if (failedSources.length > 0) {
      logger.info("Failed data sources");
      logger.info({ failedSources });
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
    logger.debug({ subsector });
    setSelectedSubsector(subsector);
    onSubsectorDrawerOpen();
  };
  const onSubsectorSave = (subsector: SubSectorWithRelations) => {
    logger.debug({ subsector }, "Save subsector");
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

  const { showSuccessToast } = UseSuccessToast({
    title: t("file-deletion-success"),
    description: t("file-deletion-success"),
    duration: 2000,
  });

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
        showError(
          "file-deletion-error",
          "file-deletion-error-description",
          2000,
        );
      } else {
        showSuccessToast();
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
      setNewlyConnectedDataSourceIds(
        newlyConnectedDataSourceIds.filter(
          (connectedSource) => connectedSource !== source.datasourceId,
        ),
      );
      onSearchDataSourcesClicked();
    } else {
      logger.error("Something went wrong when disconnecting data source");
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

  const MotionBox = motion.create(
    // the display name is added below, but the linter isn't picking it up
    // eslint-disable-next-line react/display-name
    forwardRef<HTMLDivElement, any>((props, ref) => (
      <Box ref={ref} {...props} />
    )),
  );
  MotionBox.displayName = "MotionBox";

  const scrollResizeHeaderThreshold = 50;
  const isExpanded = scrollPosition > scrollResizeHeaderThreshold;
  const { organization, isFrozenCheck } = useOrganizationContext();

  return (
    <>
      <Box id="top" />
      <Box
        position="fixed"
        zIndex={10}
        top={0}
        w="full"
        h={isExpanded ? "205px" : "400px"}
        transition="all 50ms linear"
        bg="white"
        borderBottomWidth={isExpanded ? "1px" : "0px"}
        borderColor="border.neutral"
        pt={isExpanded ? "0px" : "115px"}
      >
        <Box w="1090px" mx="auto" px={4}>
          <Box
            w="full"
            alignItems="center"
            gap="16px"
            mb="24px"
            transition="all 50ms linear"
            display="flex"
          >
            <Button
              variant="ghost"
              fontSize="14px"
              color="content.link"
              fontWeight="bold"
              onClick={() => router.push(`/${lng}/${inventory}/data`)}
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
            <Flex direction="row" w="full">
              <Icon
                as={currentStep.icon}
                boxSize={8}
                color="interactive.secondary"
                mr={4}
              />
              <Box w="full" display="flex" flexDirection="column" gap={3}>
                <Heading
                  fontWeight="semibold"
                  textTransform="capitalize"
                  lineHeight="32px"
                  mb={2}
                  transition="all 50ms linear"
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
                  <Heading size="sm" ml={6} mt={-1} whiteSpace="nowrap">
                    {t("completion-percent", {
                      progress: formatPercentage(totalStepCompletion),
                    })}
                  </Heading>
                </Flex>
                {scrollPosition <= 0 ? (
                  <Box display="flex" flexDirection="row" gap={2}>
                    <Badge mr={4} w="auto">
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
                    <Badge w="auto">
                      <Icon
                        as={CircleIcon}
                        boxSize={6}
                        color="interactive.tertiary"
                      />
                      {t("data-added-percent", {
                        progress: formatPercentage(currentStep.addedProgress),
                      })}
                    </Badge>
                  </Box>
                ) : (
                  ""
                )}
              </Box>
            </Flex>
          </Box>
        </Box>
      </Box>
      <Box pt={"48px"} pb={16} w="1090px" maxW="full" mx="auto" px={4}>
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
                      shadow="none"
                      border="1px solid"
                      borderColor="border.overlay"
                      _hover={{ shadow: "xl" }}
                      transition="all 300ms"
                      onClick={() => {
                        router.push(
                          `/${inventory}/data/${convertSectorReferenceNumberToNumber(currentStep.referenceNumber)}/${subSector.subsectorId}?refNo=${subSector.referenceNumber}`,
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
                  onClick={() =>
                    isFrozenCheck() ? null : onSearchDataSourcesClicked()
                  }
                >
                  <Icon as={MdRefresh} boxSize={9} />
                </IconButton>
              )}
            </Flex>
            {!dataSources ? (
              <SearchDataSourcesPrompt
                t={t}
                isSearching={areDataSourcesLoading}
                onSearchClicked={() =>
                  isFrozenCheck() ? null : onSearchDataSourcesClicked()
                }
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
                        data-testid="source-card"
                        variant="outline"
                        borderColor={
                          isSourceConnected(source) &&
                          source.inventoryValues?.length
                            ? "interactive.tertiary"
                            : ""
                        }
                        borderWidth={2}
                        shadow="none"
                        _hover={{ shadow: "xl" }}
                        transition="all 300ms"
                      >
                        <Card.Header>
                          {/* TODO add icon to DataSource */}
                          <Icon as={MdHomeWork} boxSize={9} mb={6} />
                          <Heading size="sm" lineClamp={2} minHeight={10}>
                            {getTranslationFromDict(source.datasetName)}
                          </Heading>
                        </Card.Header>
                        <Card.Body>
                          <Flex direction="row" mb={4} wrap="wrap" gap={2}>
                            <Badge fontSize={11}>
                              <Icon
                                as={DataCheckIcon}
                                boxSize={5}
                                color="content.tertiary"
                              />
                              {t("data-quality")}:{" "}
                              {t("quality-" + source.dataQuality)}
                            </Badge>
                            {source.subCategory?.scope && (
                              <Badge fontSize={11}>
                                <Icon
                                  as={FiTarget}
                                  boxSize={4}
                                  color="content.tertiary"
                                />
                                {t("scope")}:{" "}
                                {source.subCategory.scope.scopeName}
                              </Badge>
                            )}
                          </Flex>
                          <Text
                            color="content.tertiary"
                            lineClamp={5}
                            minHeight={120}
                          >
                            {getTranslationFromDict(
                              source.datasetDescription,
                            ) ||
                              getTranslationFromDict(
                                source.methodologyDescription,
                              )}
                          </Text>
                          <Link
                            textDecoration="underline"
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
                              onClick={() =>
                                isFrozenCheck()
                                  ? null
                                  : onDisconnectThirdPartyData(source)
                              }
                              loading={
                                isDisconnectLoading &&
                                source.datasourceId ===
                                  disconnectingDataSourceId
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
                        </Card.Body>
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
        {hasFeatureFlag(FeatureFlags.UPLOAD_OWN_DATA_ENABLED) && (
          <>
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
                          onFileSelect={() =>
                            isFrozenCheck()
                              ? null
                              : handleFileSelect(uploadedFile!)
                          }
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
                                    <Box w="full" position="relative" pl="63px">
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
            {/* Add file data modal */}
            <AddFileDataDialog
              isOpen={openFileUploadDialog}
              onClose={() => setOpenFileUploadDialog(false)}
              subsectors={currentStep.subSectors}
              onOpenChange={setOpenFileUploadDialog}
              t={t}
              uploadedFile={uploadedFile!}
              currentStep={currentStep}
              userInfo={userInfo}
              inventory={inventory}
            />
          </>
        )}

        {/*** Drawers ***/}
        <SourceDrawer
          source={selectedSource}
          sourceData={selectedSourceData}
          sector={{ sectorName: currentStep.sector?.sectorName ?? "" }}
          isOpen={isSourceDrawerOpen}
          onClose={onSourceDrawerClose}
          onConnectClick={() => onConnectClick(selectedSource!)}
          isConnectLoading={isConnectDataSourceLoading}
          t={t}
          inventoryId={inventory}
        />
      </Box>
    </>
  );
}
