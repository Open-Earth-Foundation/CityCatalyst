import { Box, Switch, TabPanel, Text } from "@chakra-ui/react";
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
import { ActivityValue } from "@/models/ActivityValue";
import { InventoryValue } from "@/models/InventoryValue";
import EmissionDataSection from "@/components/Tabs/Activity/emission-data-section";
import SelectMethodology from "@/components/Tabs/Activity/select-methodology";
import ExternalDataSection from "@/components/Tabs/Activity/external-data-section";

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
  activityData: ActivityValue[] | undefined;
  subsectorId: string;
  inventoryValues: InventoryValue[];
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
  const [isUnavailableChecked, setIsChecked] = useState<boolean>(false);

  const { methodologies, directMeasure } = getMethodologies();
  // extract the methodology used from the filtered scope

  const [methodology, setMethodology] = useState<Methodology | DirectMeasure>();

  const getfilteredActivityValues = useMemo(() => {
    let methodologyId: string | null | undefined = undefined;
    const filteredValues = activityData?.filter((activity) => {
      let val = activity.inventoryValue.gpcReferenceNumber === referenceNumber;
      if (val && !methodologyId) {
        methodologyId = activity.inventoryValue.inputMethodology;
      }
      return val;
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
  }, [activityData, referenceNumber]);

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
        value.dataSource?.sourceType === "third_party",
    );
  }, [inventoryValues, referenceNumber]);

  const inventoryValue = useMemo<InventoryValue | null>(() => {
    return (
      inventoryValues?.find(
        (value) =>
          value.gpcReferenceNumber === referenceNumber &&
          value.inputMethodology ===
            (methodology?.id.includes("direct-measure")
              ? "direct-measure"
              : methodology?.id),
      ) ?? null
    );
  }, [inventoryValues, methodology]);

  const getActivityValuesByMethodology = (
    activityValues: ActivityValue[] | undefined,
  ) => {
    const isDirectMeasure = methodology?.id.includes("direct-measure");

    return activityValues?.filter((activity) =>
      isDirectMeasure
        ? activity.inventoryValue.inputMethodology === "direct-measure"
        : activity.inventoryValue.inputMethodology !== "direct-measure",
    );
  };

  const activityValues =
    getActivityValuesByMethodology(getfilteredActivityValues) || [];

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
    setIsChecked(!isUnavailableChecked);
  };

  return (
    <>
      <TabPanel p="0" pt="48px">
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
          <Box display="flex" gap="16px" fontSize="label.lg">
            <Switch
              disabled={!!externalInventoryValue}
              isChecked={isUnavailableChecked}
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
        {isUnavailableChecked && <ScopeUnavailable t={t} />}
        {!isUnavailableChecked && externalInventoryValue && (
          <Box h="auto" px="24px" py="32px" bg="base.light" borderRadius="8px">
            <ExternalDataSection
              t={t}
              inventoryValue={externalInventoryValue}
            />
          </Box>
        )}
        {!isUnavailableChecked && !externalInventoryValue && (
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
                  activityValues={activityValues}
                  suggestedActivities={suggestedActivities}
                  totalEmissions={totalEmissions}
                  changeMethodology={changeMethodology}
                  inventoryValue={inventoryValue}
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
