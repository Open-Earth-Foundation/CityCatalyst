import {
  Box,
  Icon,
  IconButton,
  Spinner,
  Tabs,
  Text,
  Badge,
  Card,
  Center,
  Flex,
  Heading,
  HStack,
  Link,
  SimpleGrid,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import React, { FC, useMemo, useState } from "react";
import HeadingText from "../../heading-text";
import { TFunction } from "i18next";
import ScopeUnavailable from "./scope-unavailable";
import {
  DirectMeasure,
  MANUAL_INPUT_HIERARCHY,
  Methodology,
  SuggestedActivity,
} from "@/util/form-schema";
import type {
  ActivityValue,
  ActivityValueAttributes,
} from "@/models/ActivityValue";
import type {
  InventoryValue,
  InventoryValueAttributes,
} from "@/models/InventoryValue";
import EmissionDataSection from "@/components/Tabs/Activity/emission-data-section";
import SelectMethodology from "@/components/Tabs/Activity/select-methodology";
import ExternalDataSection from "@/components/Tabs/Activity/external-data-section";
import { api } from "@/services/api";
import {
  MdModeEditOutline,
  MdCheckCircleOutline,
  MdInfoOutline,
  MdClose,
  MdOutlineHomeWork,
  MdOutlineLocalShipping,
  MdOutlineDelete,
  MdOutlineFactory,
} from "react-icons/md";
import { LuWheat } from "react-icons/lu";
import { FiTarget } from "react-icons/fi";
import { Switch } from "@/components/ui/switch";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SourceDrawer } from "@/components/GHGI/data-step/SourceDrawer";
import { convertKgToTonnes } from "@/util/helpers";
import { bigIntToDecimal } from "@/util/big_int";
import { getTranslationFromDict } from "@/i18n";
import { DataCheckIcon } from "@/components/icons";
import { logger } from "@/services/logger";
import type { DataSourceWithRelations } from "@/components/GHGI/data-step/types";
import { SECTORS } from "@/util/constants";
import { UseErrorToast } from "@/hooks/Toasts";
import { toaster } from "@/components/ui/toaster";

interface ActivityTabProps {
  t: TFunction;
  referenceNumber: string;
  isUnavailableChecked?: boolean;
  isMethodologySelected?: boolean;
  userActivities?: [];
  areActivitiesLoading?: boolean;
  totalConsumption?: boolean;
  totalConsumptionUnit?: boolean;
  inventoryId: string;
  step: string;
  activityData: ActivityValueAttributes[] | undefined;
  subsectorId: string;
  inventoryValues: InventoryValueAttributes[];
}

const ensureProtocol = (url?: string) => {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    return "https://" + url;
  }
  return url;
};

const ActivityTab: FC<ActivityTabProps> = ({
  t,
  referenceNumber,
  inventoryId,
  step,
  activityData,
  subsectorId,
  inventoryValues,
}) => {
  const { data: inventoryProgress } = api.useGetInventoryProgressQuery(inventoryId);

  const {
    data: allDataSources,
    isLoading: isDataSourcesLoading,
    refetch: refetchDataSources,
  } = api.useGetAllDataSourcesQuery({ inventoryId });

  const [connectDataSource, { isLoading: isConnectDataSourceLoading }] =
    api.useConnectDataSourceMutation();

  const [disconnectThirdPartyData, { isLoading: isDisconnectLoading }] =
    api.useDisconnectThirdPartyDataMutation();

  const [connectingDataSourceId, setConnectingDataSourceId] = useState<string | null>(null);
  const [disconnectingDataSourceId, setDisconnectingDataSourceId] = useState<string | null>(null);
  const [newlyConnectedDataSourceIds, setNewlyConnectedDataSourceIds] = useState<string[]>([]);
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});

  const {
    open: isSourceDrawerOpen,
    onClose: onSourceDrawerClose,
    onOpen: onSourceDrawerOpen,
  } = useDisclosure();
  const [selectedSource, setSelectedSource] = useState<DataSourceWithRelations>();
  const [selectedSourceData, setSelectedSourceData] = useState<any>();

  const onSourceClick = (source: DataSourceWithRelations, data: any) => {
    setSelectedSource(source);
    setSelectedSourceData(data);
    onSourceDrawerOpen();
  };

  const onButtonHover = (source: DataSourceWithRelations) => {
    setHoverStates((prev) => ({ ...prev, [source.datasourceId]: true }));
  };

  const onMouseLeave = (source: DataSourceWithRelations) => {
    setHoverStates((prev) => ({ ...prev, [source.datasourceId]: false }));
  };



  const showError = (title: string, description: string, duration?: number) => {
    const { showErrorToast } = UseErrorToast({
      title: t(title),
      description: t(description),
      duration,
    });
    showErrorToast();
  };

  const onConnectClick = async (source: DataSourceWithRelations) => {
    if (isSourceGpcBlocked(source)) {
      return;
    }
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
      refetchDataSources();
    }
  };

  const onDisconnectThirdPartyData = async (source: DataSourceWithRelations) => {
    setDisconnectingDataSourceId(source.datasourceId);
    try {
      await disconnectThirdPartyData({
        inventoryId: inventoryId,
        datasourceId: source.datasourceId,
      }).unwrap();
      toaster.create({
        title: t("disconnected-data-source"),
        type: "info",
        duration: 5000,
      });
      setNewlyConnectedDataSourceIds(
        newlyConnectedDataSourceIds.filter((id) => id !== source.datasourceId),
      );
    } catch (error: any) {
      logger.error(
        { err: error, source: source },
        "Failed to disconnect data source",
      );
      showError("disconnect-data-source-error", "data-source-connect-load-error");
    } finally {
      setDisconnectingDataSourceId(null);
      refetchDataSources();
    }
  };

  function isSourceConnected(source?: DataSourceWithRelations): boolean {
    if (!source) {
      return false;
    }
    return (
      (source.inventoryValues && source.inventoryValues.length > 0) ||
      newlyConnectedDataSourceIds.indexOf(source.datasourceId) > -1
    );
  }

  function getSourceGpcReferenceNumber(
    source: DataSourceWithRelations,
  ): string | undefined {
    return (
      source.subCategory?.referenceNumber ?? source.subSector?.referenceNumber
    );
  }

  function isSourceGpcBlocked(source: DataSourceWithRelations): boolean {
    if (isSourceConnected(source)) {
      return false;
    }
    const gpcReferenceNumber = getSourceGpcReferenceNumber(source);
    if (!gpcReferenceNumber) {
      return false;
    }
    return (
      inventoryProgress?.inventory.inventoryValues?.some(
        (value) => value.gpcReferenceNumber === gpcReferenceNumber,
      ) ?? false
    );
  }

  const matchingSources = useMemo(() => {
    if (!allDataSources?.data) return [];
    return allDataSources.data.filter(({ source, data }) => {
      const sourceRef = source.subCategory?.referenceNumber || source.subSector?.referenceNumber;
      return sourceRef === referenceNumber && data;
    });
  }, [allDataSources, referenceNumber]);

  const [isMethodologySelected, setIsMethodologySelected] =
    useState<boolean>(false);
  const [selectedMethodology, setSelectedMethodology] = useState("");
  const [showUnavailableForm, setShowUnavailableForm] =
    useState<boolean>(false);

  const { methodologies, directMeasure } = getMethodologies();

  // extract the methodology used from the filtered scope

  const [methodology, setMethodology] = useState<Methodology | DirectMeasure>();
  const filteredActivityValues = useMemo(() => {
    let methodologyId: string | null | undefined = undefined;
    const filteredValues = activityData?.filter((activity) => {
      const activityValue = activity as unknown as ActivityValue; // TODO use InventoryValueResponse/ ActivityValueResponse everywhere
      let isCurrentRefno =
        activityValue.inventoryValue.gpcReferenceNumber === referenceNumber;
      if (isCurrentRefno && !methodologyId) {
        methodologyId = activityValue.inventoryValue.inputMethodology;
      }
      return isCurrentRefno;
    });

    // TODO remove this. Only extract the methodology from the inventory value if it exists
    if (methodologyId) {
      let methodology =
        methodologies.find((methodology) => methodology.id === methodologyId) ??
        directMeasure;
      setSelectedMethodology(methodologyId);
      setIsMethodologySelected(true);
      if (methodology && methodologyId)
        setMethodology({
          ...methodology,
          fields: (methodology as Methodology).activities
            ? (methodology as Methodology).activities
            : (methodology as unknown as DirectMeasure)["extra-fields"],
        });
    }

    return filteredValues;
  }, [activityData, referenceNumber, directMeasure, methodologies]);

  function getMethodologies() {
    const methodologies =
      MANUAL_INPUT_HIERARCHY[referenceNumber]?.methodologies || [];
    const directMeasure =
      MANUAL_INPUT_HIERARCHY[referenceNumber]?.directMeasure;
    return { methodologies, directMeasure };
  }

  const externalInventoryValue = useMemo(() => {
    return inventoryValues?.find(
      (value) =>
        value.gpcReferenceNumber === referenceNumber &&
        (value as unknown as InventoryValue).dataSource,
    );
  }, [inventoryValues, referenceNumber]);

  const [updateInventoryValue, { isLoading }] =
    api.useUpdateOrCreateInventoryValueMutation();

  const [deleteInventoryValue, { isLoading: isDeletingInventoryValue }] =
    api.useDeleteInventoryValueMutation();

  const { data: userInfo } = api.useGetUserInfoQuery();

  const inventoryValue = useMemo<InventoryValueAttributes | null>(() => {
    return (
      inventoryValues?.find(
        (value) =>
          (value.gpcReferenceNumber === referenceNumber &&
            value.inputMethodology ===
              (methodology?.id.includes("direct-measure")
                ? "direct-measure"
                : methodology?.id)) ||
          value.unavailableExplanation,
      ) ?? null
    );
  }, [inventoryValues, methodology, referenceNumber]);

  const activityValues = filteredActivityValues;

  const makeScopeAvailableFunc = () => {
    if (activityValues?.length && activityValues.length > 0) {
      updateInventoryValue({
        inventoryId: inventoryId,
        subSectorId: subsectorId,
        data: {
          unavailableReason: "",
          unavailableExplanation: "",
          gpcReferenceNumber: referenceNumber,
        },
      });
    } else {
      deleteInventoryValue({
        inventoryId: inventoryId,
        subSectorId: subsectorId,
      });
    }
  };

  const getSuggestedActivities = (): SuggestedActivity[] => {
    if (!selectedMethodology) return [];
    let methodology;
    const scope = MANUAL_INPUT_HIERARCHY[referenceNumber];
    if (selectedMethodology.includes("direct-measure")) {
      methodology = scope.directMeasure;
    } else {
      methodology = (scope.methodologies || []).find(
        (m) => m.id === selectedMethodology,
      );
    }
    return (methodology?.suggestedActivities ?? []) as SuggestedActivity[];
  };

  const handleMethodologySelected = (
    methodology: Methodology | DirectMeasure,
  ) => {
    setSelectedMethodology(methodology.id);
    setIsMethodologySelected(!isMethodologySelected);
    setMethodology(methodology);
  };

  const changeMethodology = () => {
    setSelectedMethodology("");
    setIsMethodologySelected(false);
  };

  const suggestedActivities: SuggestedActivity[] = getSuggestedActivities();

  const handleSwitch = (e: any) => {
    if (!inventoryValue?.unavailableExplanation && !showUnavailableForm) {
      showUnavailableFormFunc();
    }
    if (!inventoryValue?.unavailableExplanation && showUnavailableForm) {
      setShowUnavailableForm(false);
    }

    if (inventoryValue?.unavailableExplanation) {
      makeScopeAvailableFunc();
    }
  };

  const showUnavailableFormFunc = () => {
    setShowUnavailableForm(true);
  };

  const scopeNotApplicable = useMemo(() => {
    return inventoryValue?.unavailableExplanation || showUnavailableForm;
  }, [showUnavailableForm, inventoryValue]);

  const notationKey = useMemo(() => {
    switch (inventoryValue?.unavailableReason) {
      case "reason-NE":
        return "notation-key-NE";
      case "reason-C":
        return "notation-key-C";
      case "reason-IE":
        return "notation-key-IE";
      default:
        return "notation-key-NO";
    }
  }, [inventoryValue]);

  const { isFrozenCheck } = useOrganizationContext();

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        mb="48px"
      >
        <HeadingText
          data-testid="manual-input-header"
          title={t("add-data-manually")}
        />
        <Box display="flex" alignItems="center" gap="16px" fontSize="label.lg">
          {(isLoading || isDeletingInventoryValue) && (
            <Spinner size="sm" color="border.neutral" />
          )}
          <Switch
            disabled={!!externalInventoryValue}
            checked={
              showUnavailableForm || !!inventoryValue?.unavailableExplanation
            }
            onChange={(e) => (isFrozenCheck() ? null : handleSwitch(e))}
          />
          <Text
            opacity={!!externalInventoryValue ? 0.4 : 1}
            fontFamily="heading"
            fontWeight="medium"
          >
            {t("scope-not-applicable")}
          </Text>
        </Box>
      </Box>
      {inventoryValue?.unavailableExplanation && !showUnavailableForm && (
        <Box h="auto" px="24px" py="32px" bg="base.light" borderRadius="8px">
          <Box mb="8px">
            <HeadingText title={t("scope-unavailable-title")} />
            <Text
              letterSpacing="wide"
              fontSize="body.lg"
              fontWeight="normal"
              color="interactive.control"
              mb="48px"
            >
              {t("scope-unavailable-description")}
            </Text>

            <Box
              display="flex"
              gap="48px"
              alignItems="center"
              borderWidth="1px"
              borderRadius="12px"
              borderColor="border.neutral"
              py={4}
              pl={6}
              pr={3}
            >
              <Box>
                <Text
                  fontWeight="bold"
                  fontSize="title.md"
                  fontFamily="heading"
                >
                  {t(notationKey)}
                </Text>
                <Text fontSize="body.md" color="interactive.control">
                  {t("notation-key")}
                </Text>
              </Box>
              <Text
                fontSize="body.md"
                fontFamily="body"
                flex="1 0 0"
                truncate
                lineClamp={2}
              >
                <Text fontSize="body.md" fontFamily="body">
                  <strong> {t("reason")}: </strong>
                  {t(inventoryValue?.unavailableReason as string)}
                </Text>
              </Text>
              <Text
                fontSize="body.md"
                flex="1 0 0"
                fontFamily="body"
                truncate
                lineClamp={2}
              >
                {inventoryValue.unavailableExplanation}
              </Text>
              <IconButton
                onClick={showUnavailableFormFunc}
                aria-label="edit"
                variant="ghost"
                color="content.tertiary"
              >
                <Icon as={MdModeEditOutline} size="lg" />
              </IconButton>
            </Box>
          </Box>
        </Box>
      )}
      {showUnavailableForm && (
        <ScopeUnavailable
          inventoryId={inventoryId}
          gpcReferenceNumber={referenceNumber}
          subSectorId={subsectorId}
          t={t}
          onSubmit={() => setShowUnavailableForm(false)}
          reason={inventoryValue?.unavailableReason ?? undefined}
          justification={inventoryValue?.unavailableExplanation ?? undefined}
        />
      )}
      {!scopeNotApplicable && externalInventoryValue && (
        <Box h="auto" px="24px" py="32px" bg="base.light" borderRadius="8px">
          <ExternalDataSection
            t={t}
            inventoryValue={externalInventoryValue as unknown as InventoryValue}
            numberFormat={userInfo?.numberFormat}
            onDisconnect={(datasourceId) => {
              setNewlyConnectedDataSourceIds((prev) =>
                prev.filter((id) => id !== datasourceId),
              );
              refetchDataSources();
            }}
          />
        </Box>
      )}
      {!scopeNotApplicable && !externalInventoryValue && (
        <>
          {isMethodologySelected ? (
            <Box
              h="auto"
              px="24px"
              py="32px"
              bg="base.light"
              borderRadius="8px"
            >
              {" "}
              <EmissionDataSection
                t={t}
                methodology={methodology}
                inventoryId={inventoryId}
                subsectorId={subsectorId}
                refNumberWithScope={referenceNumber}
                activityValues={activityValues as unknown as ActivityValue[]}
                suggestedActivities={suggestedActivities}
                changeMethodology={changeMethodology}
                inventoryValue={inventoryValue as unknown as InventoryValue}
                numberFormat={userInfo?.numberFormat}
              />
            </Box>
          ) : (
            <SelectMethodology
              t={t}
              methodologies={methodologies}
              handleMethodologySelected={handleMethodologySelected}
              directMeasure={directMeasure}
            />
          )}
        </>
      )}

      {(isDataSourcesLoading || matchingSources.length > 0) && (
        <Box mt={12} borderTop="1px solid" borderColor="border.neutral" pt={8}>
          <Heading fontSize="title.lg" mb={2}>
            {t("browse-and-connect-external-datasets-heading")}
          </Heading>
          <Text color="content.tertiary" mb={8}>
            {t("browse-and-connect-external-datasets-description")}
          </Text>
          {isDataSourcesLoading ? (
            <Center py="48px">
              <Spinner size="xl" color="interactive.secondary" />
            </Center>
          ) : (
          <SimpleGrid
            columns={{
              base: 1,
              md: 2,
              lg: 3,
            }}
            gap="16px"
          >
            {matchingSources.map(({ source, data }) => {
              const isHovered = hoverStates[source.datasourceId];
              const isConnected = isSourceConnected(source);
              const isBlocked = isSourceGpcBlocked(source);

              const romanSector = {
                "1": "I",
                "2": "II",
                "3": "III",
                "4": "IV",
                "5": "V",
              }[step] ?? "I";

              const sectorIcon = {
                I: MdOutlineHomeWork,
                II: MdOutlineLocalShipping,
                III: MdOutlineDelete,
                IV: MdOutlineFactory,
                V: LuWheat,
              }[romanSector] ?? MdOutlineHomeWork;

              return (
                <Card.Root
                  key={source.datasourceId}
                  data-testid="source-card"
                  variant="outline"
                  borderWidth="1px"
                  borderColor={
                    isConnected
                      ? "interactive.tertiary"
                      : "border.overlay"
                  }
                  shadow="none"
                  _hover={{ shadow: "xl" }}
                  transition="all 300ms"
                  w="full"
                  p="24px"
                  gap="4px"
                >
                  <Card.Header p="0" display="flex" flexDirection="column" gap="0">
                    <Icon
                      as={sectorIcon}
                      boxSize={9}
                      color="content.tertiary-light"
                      mb="10px"
                    />
                    <Flex direction="row" align="center" gap="8px">
                      <Badge
                        variant="plain"
                        fontSize="label.sm"
                        fontWeight="medium"
                        fontFamily="heading"
                        letterSpacing="widest"
                        bg="background.graySubtle"
                        color="content.secondary"
                        px="8px"
                        py="1px"
                        borderRadius="md"
                        lineHeight="1.2"
                        borderWidth="0"
                      >
                        {source.subCategory?.referenceNumber ||
                          source.subSector?.referenceNumber}
                      </Badge>
                      <Tooltip showArrow content={source.subSector?.subsectorName}>
                        <Text
                          fontSize="overline"
                          fontWeight="bold"
                          color="content.primary"
                          textTransform="uppercase"
                          letterSpacing="widest"
                          lineHeight="24"
                          fontFamily="heading"
                          lineClamp={1}
                        >
                          {source.subSector?.subsectorName}
                        </Text>
                      </Tooltip>
                    </Flex>
                    <Heading
                      fontSize="title.md"
                      lineClamp={2}
                      minHeight={10}
                      mt="6px"
                      lineHeight={24}
                    >
                      {getTranslationFromDict(source.datasetName)}
                    </Heading>
                    <Text fontSize="label.md" mt="4px">
                      {t("by-data-source")}{" "}
                      <Link
                        href={ensureProtocol(source.publisher?.url)}
                        target="_blank"
                        textDecoration="underline"
                        color="content.link"
                        rel="noreferrer noopener"
                      >
                        {source.publisher?.name}
                      </Link>
                    </Text>
                  </Card.Header>
                  <Card.Body justifyContent="space-between" p="0" mt="12px">
                    <Flex direction="row" mb={0} wrap="wrap" gap={2}>
                      {data?.totals?.emissions?.co2eq_100yr != null &&
                        data.totals.emissions.co2eq_100yr !== 0n && (
                        <Text fontSize="display.sm" fontWeight="semibold">
                          {convertKgToTonnes(
                            bigIntToDecimal(
                              data.totals.emissions.co2eq_100yr,
                            ).toNumber(),
                          )}
                        </Text>
                      )}
                      <Flex direction="row" gap="4px" flexWrap="nowrap">
                        <Badge fontSize={12} borderColor="border.overlay" w="fit-content">
                          <Icon as={DataCheckIcon} boxSize={5} color="content.tertiary" />
                          {t("data-quality")}: {t("quality-" + source.dataQuality)}
                        </Badge>
                        {source.subCategory?.scope && (
                          <Badge fontSize={12} borderColor="border.overlay" w="fit-content">
                            <Icon as={FiTarget} boxSize={4} color="content.tertiary" />
                            {t("scope")}: {source.subCategory.scope.scopeName}
                          </Badge>
                        )}
                      </Flex>
                    </Flex>
                    <Text
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                      overflow="hidden"
                      color="content.tertiary"
                      lineClamp={isConnected ? 0 : 4}
                      maxHeight={isConnected ? "100px" : "184px"}
                      fontFamily="body"
                      fontSize="body.md"
                      lineHeight="20px"
                      fontWeight="regular"
                      marginTop="8px"
                    >
                      {getTranslationFromDict(source.datasetDescription) ||
                        getTranslationFromDict(source.methodologyDescription)}
                    </Text>
                    <VStack w="full" mb="16px" mt="12px">
                      <Link
                        textDecoration="underline"
                        mt={4}
                        mb={2}
                        onClick={() => onSourceClick(source, data)}
                        alignSelf="flex-start"
                        fontSize="label.lg"
                        fontWeight="medium"
                        letterSpacing="wide"
                      >
                        {t("see-more-details")}
                      </Link>
                      {isConnected ? (
                        <Button
                          variant="outline"
                          w="full"
                          h="50px"
                          bg={
                            isHovered
                              ? "semantic.dangerOverlay"
                              : "semantic.successOverlay"
                          }
                          borderColor={
                            isHovered
                              ? "semantic.danger"
                              : "semantic.success"
                          }
                          borderWidth="1px"
                          color={
                            isHovered
                              ? "semantic.danger"
                              : "semantic.success"
                          }
                          fontWeight="semibold"
                          fontSize="14px"
                          onClick={() =>
                            isFrozenCheck()
                              ? null
                              : onDisconnectThirdPartyData(source)
                          }
                          loading={
                            isDisconnectLoading &&
                            source.datasourceId === disconnectingDataSourceId
                          }
                          onMouseEnter={() => onButtonHover(source)}
                          onMouseLeave={() => onMouseLeave(source)}
                        >
                          <Icon as={MdCheckCircleOutline} />
                          {isHovered
                            ? t("disconnect-data")
                            : t("data-connected")}
                        </Button>
                      ) : isBlocked ? (
                        <Tooltip
                          showArrow
                          content={t("data-already-added-connected")}
                        >
                          <Button
                            variant="outline"
                            w="full"
                            h="50px"
                            borderWidth="0"
                            bgColor="background.graySubtle"
                            disabled
                            color="interactive.control"
                            fontWeight="semibold"
                            fontSize="14px"
                          >
                            {t("connect-data")}
                            <Icon as={MdInfoOutline} boxSize={4} />
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button
                          variant="outline"
                          w="full"
                          h="50px"
                          borderWidth="1px"
                          borderColor="border.overlay"
                          bgColor="background.neutral"
                          color="interactive.secondary"
                          fontWeight="semibold"
                          fontSize="14px"
                          onClick={() => onConnectClick(source)}
                          loading={
                            isConnectDataSourceLoading &&
                            source.datasourceId === connectingDataSourceId
                          }
                        >
                          {t("connect-data")}
                        </Button>
                      )}
                    </VStack>
                  </Card.Body>
                </Card.Root>
              );
            })}
          </SimpleGrid>
          )}
        </Box>
      )}

      {selectedSource && (
        <SourceDrawer
          inventoryId={inventoryId}
          source={selectedSource}
          hideActions={true}
          totalEmissionsData={selectedSourceData?.totals?.emissions?.co2eq_100yr?.toString()}
          sourceData={selectedSourceData}
          sector={{ sectorName: SECTORS[parseInt(step) - 1].name }}
          isOpen={isSourceDrawerOpen}
          onClose={onSourceDrawerClose}
          onConnectClick={() => onConnectClick(selectedSource)}
          isConnectLoading={
            isConnectDataSourceLoading &&
            selectedSource?.datasourceId === connectingDataSourceId
          }
          t={t}
          numberFormat={userInfo?.numberFormat}
          isConnected={isSourceConnected(selectedSource)}
        />
      )}
    </>
  );
};

export default ActivityTab;
