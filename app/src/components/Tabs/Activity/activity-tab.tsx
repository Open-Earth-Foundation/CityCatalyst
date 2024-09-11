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

interface ActivityTabProps {
  t: TFunction;
  referenceNumber: string;
  isUnavailableChecked?: boolean;
  isMethodologySelected?: boolean;
  userActivities?: [];
  areActivitiesLoading?: boolean;
  totalConsumption?: boolean;
  totalConsumptionUnit?: boolean;
  filteredScope: number;
  inventoryId: string;
  step: string;
  activityData: ActivityValue[] | undefined;
  subsectorId: string;
  inventoryValues: InventoryValue[];
}

const ActivityTab: FC<ActivityTabProps> = ({
  t,
  userActivities,
  referenceNumber,
  areActivitiesLoading,
  totalConsumption,
  totalConsumptionUnit,
  filteredScope,
  inventoryId,
  step,
  activityData,
  subsectorId,
  inventoryValues,
}) => {
  let totalEmissions = 0;

  activityData?.forEach((activity: any) => {
    totalEmissions += parseInt(activity?.co2eq);
  });

  const [isMethodologySelected, setIsMethodologySelected] = useState();
  const [selectedMethodology, setSelectedMethodology] = useState("");
  const [isUnavailableChecked, setIsChecked] = useState<boolean>(false);

  const refNumberWithScope = referenceNumber + "." + (filteredScope || 1);

  const { methodologies, directMeasure } = getMethodologies();

  // extract the methodology used from the filtered scope

  const [methodology, setMethodology] = useState<Methodology>();

  const getfilteredActivityValues = useMemo(() => {
    let methodologyId: string | null | undefined = null;
    const filteredValues = activityData?.filter((activity) => {
      let val =
        activity.inventoryValue.gpcReferenceNumber === refNumberWithScope;
      if (val && !methodologyId) {
        methodologyId = activity.inventoryValue.inputMethodology;
      }
      return val;
    });

    if (methodologyId) {
      let methodology =
        methodologies.find((methodology) => methodology.id === methodologyId) ??
        directMeasure;
      setSelectedMethodology(methodologyId);
      setIsMethodologySelected(true);
      if (methodology && methodologyId)
        setMethodology({
          ...methodology,
          fields: methodology.activities
            ? methodology.activities
            : (methodology as unknown as DirectMeasure)["extra-fields"],
        });
    }

    return filteredValues;
  }, [activityData, refNumberWithScope]);

  function getMethodologies() {
    const methodologies =
      MANUAL_INPUT_HIERARCHY[refNumberWithScope]?.methodologies || [];
    const directMeasure =
      MANUAL_INPUT_HIERARCHY[refNumberWithScope]?.directMeasure;
    return { methodologies, directMeasure };
  }

  const inventoryValue = useMemo<InventoryValue | null>(() => {
    return (
      inventoryValues?.find(
        (value) =>
          value.gpcReferenceNumber === refNumberWithScope &&
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
    const scope = MANUAL_INPUT_HIERARCHY[refNumberWithScope];
    if (selectedMethodology.includes("direct-measure")) {
      methodology = scope.directMeasure;
    } else {
      methodology = (scope.methodologies || []).find(
        (m) => m.id === selectedMethodology,
      );
    }
    return (methodology?.suggestedActivities ?? []) as SuggestedActivity[];
  };

  const handleMethodologySelected = (methodology: Methodology) => {
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
            <Switch isChecked={isUnavailableChecked} onChange={handleSwitch} />
            <Text fontFamily="heading" fontWeight="medium">
              {t("scope-not-applicable")}
            </Text>
          </Box>
        </Box>
        {isUnavailableChecked && <ScopeUnavailable t={t} />}
        {!isUnavailableChecked && (
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
                  refNumberWithScope={refNumberWithScope}
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
