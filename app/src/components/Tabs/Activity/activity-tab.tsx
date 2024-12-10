import {
  Box,
  IconButton,
  Spinner,
  Switch,
  TabPanel,
  Text,
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
import { MdModeEditOutline } from "react-icons/md";

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

const ActivityTab: FC<ActivityTabProps> = ({
  t,
  referenceNumber,
  inventoryId,
  activityData,
  subsectorId,
  inventoryValues,
}) => {
  let totalEmissions = 0;

  activityData?.forEach((activity: any) => {
    totalEmissions += parseInt(activity?.co2eq);
  });

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

  return (
    <>
      <TabPanel key={referenceNumber} p="0" pt="48px">
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
          <Box
            display="flex"
            alignItems="center"
            gap="16px"
            fontSize="label.lg"
          >
            {(isLoading || isDeletingInventoryValue) && (
              <Spinner size="sm" color="border.neutral" />
            )}
            <Switch
              disabled={!!externalInventoryValue}
              isChecked={
                showUnavailableForm || !!inventoryValue?.unavailableExplanation
              }
              onChange={handleSwitch}
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
                  className="overflow-ellipsis line-clamp-2"
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
                  className="line-clamp-2"
                >
                  {inventoryValue.unavailableExplanation}
                </Text>
                <IconButton
                  onClick={showUnavailableFormFunc}
                  icon={<MdModeEditOutline size="24px" />}
                  aria-label="edit"
                  variant="ghost"
                  color="content.tertiary"
                />
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
            reason={inventoryValue?.unavailableReason}
            justification={inventoryValue?.unavailableExplanation}
          />
        )}
        {!scopeNotApplicable && externalInventoryValue && (
          <Box h="auto" px="24px" py="32px" bg="base.light" borderRadius="8px">
            <ExternalDataSection
              t={t}
              inventoryValue={
                externalInventoryValue as unknown as InventoryValue
              }
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
                  totalEmissions={totalEmissions}
                  changeMethodology={changeMethodology}
                  inventoryValue={inventoryValue as unknown as InventoryValue}
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
      </TabPanel>
    </>
  );
};

export default ActivityTab;
