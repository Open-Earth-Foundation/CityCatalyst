import { RadioButton } from "@/components/radio-button";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Box, HStack, Heading, Tooltip, useRadioGroup } from "@chakra-ui/react";
import { ActivityDataTab } from "./ActivityDataTab";
import { DirectMeasureForm } from "./DirectMeasureForm";
import { TFunction } from "i18next";
import { useController, useForm, SubmitHandler } from "react-hook-form";
import { logger } from "@/services/logger";
import {
  ActivityData,
  DirectMeasureData,
  InventoryValueData,
  SubcategoryData,
} from "./types";
import { InventoryValueResponse } from "@/util/types";
import { GasValueAttributes } from "@/models/GasValue";
import { api } from "@/services/api";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";

type Inputs = {
  valueType: "scope-values" | "unavailable" | "";
  methodology: "activity-data" | "direct-measure" | "";
  energyType: "fuel-combustion" | "grid-supplied-energy";
  unavailableReason:
    | "no-occurrance"
    | "not-estimated"
    | "confidential-information"
    | "presented-elsewhere"
    | "";
  unavailableExplanation: string;
  activity: ActivityData;
  direct: DirectMeasureData;
};

const defaultActivityData: ActivityData = {
  activityDataAmount: undefined,
  activityDataUnit: undefined,
  emissionFactorType: "Local",
  dataQuality: "",
  co2EmissionFactor: 10,
  n2oEmissionFactor: 10,
  ch4EmissionFactor: 10,
  sourceReference: "",
};

const defaultDirectMeasureData: DirectMeasureData = {
  co2Emissions: 0n,
  ch4Emissions: 0n,
  n2oEmissions: 0n,
  dataQuality: "",
  sourceReference: "",
};

const defaultValues: Inputs = {
  valueType: "scope-values",
  methodology: "",
  energyType: "fuel-combustion",
  unavailableReason: "",
  unavailableExplanation: "",
  activity: defaultActivityData,
  direct: defaultDirectMeasureData,
};

function extractFormValues(inventoryValue: InventoryValueResponse): Inputs {
  logger.debug("Form input", inventoryValue);
  const inputs: Inputs = Object.assign({}, defaultValues);
  if (inventoryValue.unavailableReason) {
    inputs.valueType = "unavailable";
    inputs.unavailableReason = (inventoryValue.unavailableReason as any) || "";
    inputs.unavailableExplanation = inventoryValue.unavailableExplanation || "";
  } else {
    inputs.valueType = "scope-values";
    inputs.methodology =
      inventoryValue.activityValue != null ? "activity-data" : "direct-measure";
    inputs.activity = { ...defaultActivityData };
    inputs.direct = { ...defaultDirectMeasureData };

    if (inputs.methodology === "activity-data") {
      inputs.activity.activityDataAmount = inventoryValue.activityValue;
      inputs.activity.activityDataUnit = inventoryValue.activityUnits;
      // TODO emission factor ID, manual emissions factor values for each gas
      inputs.activity.dataQuality =
        inventoryValue.dataSource?.dataQuality || "";
      inputs.activity.sourceReference = inventoryValue.dataSource?.notes || "";
    } else if (inputs.methodology === "direct-measure") {
      const gasToEmissions = (inventoryValue.gasValues || []).reduce(
        (acc: Record<string, bigint>, value: GasValueAttributes) => {
          acc[value.gas!] = value.gasAmount || 0n;
          return acc;
        },
        {},
      );
      inputs.direct.co2Emissions = (gasToEmissions.CO2 || 0n) / 1000n;
      inputs.direct.ch4Emissions = (gasToEmissions.CH4 || 0n) / 1000n;
      inputs.direct.n2oEmissions = (gasToEmissions.N2O || 0n) / 1000n;
      inputs.direct.dataQuality = inventoryValue.dataSource?.dataQuality || "";
      inputs.direct.sourceReference = inventoryValue.dataSource?.notes || "";
    }
  }
  logger.debug("Form values", inputs);
  return inputs;
}

export function EmissionsForm({
  t,
  sectorNumber,
  subCategoryId,
  inventoryId,
}: {
  t: TFunction;
  sectorNumber: string;
  subCategoryId: string;
  inventoryId: string;
}) {
  const {
    data: inventoryValue,
    isLoading: isInventoryValueLoading,
    error: inventoryValueError,
  } = api.useGetInventoryValueQuery(
    { subCategoryId, inventoryId },
    { skip: !subCategoryId || !inventoryId },
  );
  const [setInventoryValue] = api.useSetInventoryValueMutation();
  let noPreviousValue =
    (inventoryValueError as FetchBaseQueryError)?.status === 404;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    watch,
    reset,
    control,
  } = useForm<Inputs>();

  const { field: methodologyField } = useController({
    name: "methodology",
    control,
    defaultValue: "",
  });
  const {
    getRootProps: getMethodologyRootProps,
    getRadioProps: getMethodologyRadioProps,
    value: methodology,
  } = useRadioGroup(methodologyField);
  const { field: valueTypeField } = useController({
    name: "valueType",
    control,
    defaultValue: "",
  });
  const {
    getRootProps: getValueTypeRootProps,
    getRadioProps: getValueTypeRadioProps,
  } = useRadioGroup(valueTypeField);

  const formData = watch();

  const isScopeCompleted = () => {
    if (formData?.methodology === "activity-data") {
      const activity = formData.activity;
      if (!activity) return false;
      return (
        activity.activityDataAmount != null &&
        activity.activityDataUnit != null &&
        activity.emissionFactorType !== "" &&
        !(
          activity.emissionFactorType === "Add custom" &&
          +activity.co2EmissionFactor === 0 &&
          +activity.n2oEmissionFactor === 0 &&
          +activity.ch4EmissionFactor === 0
        ) &&
        activity.dataQuality !== "" &&
        activity.sourceReference !== ""
      );
    } else if (formData?.methodology === "direct-measure") {
      if (!formData.direct) return false;
      return (
        (formData.direct.co2Emissions > 0 ||
          formData.direct.ch4Emissions > 0 ||
          formData.direct.n2oEmissions > 0) &&
        formData.direct.dataQuality !== "" &&
        formData.direct.sourceReference !== ""
      );
    }
    return false;
  };

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    if (!subCategoryId) return;
    logger.debug("Scope data", data);

    // decide which data from the form to save
    if (data.valueType === "unavailable") {
      await setInventoryValue({
        subCategoryId,
        inventoryId: inventoryId!,
        data: {
          unavailableReason: data.unavailableReason,
          unavailableExplanation: data.unavailableExplanation,
        },
      });
    } else if (data.valueType === "scope-values") {
      if (!isScopeCompleted()) {
        logger.error(`Data not completed for scope ${subCategoryId}!`);
        return Promise.resolve();
      }

      let inventoryValue: InventoryValueData = {
        subCategoryId,
        inventoryId: inventoryId!,
        unavailableReason: "",
        unavailableExplanation: "",
      };

      if (data.methodology === "activity-data") {
        inventoryValue.activityValue = +data.activity.activityDataAmount!;
        inventoryValue.activityUnits = data.activity.activityDataUnit;
        // TODO emission factor ID, manual emissions factor values for each gas

        inventoryValue.dataSource = {
          sourceType: "user",
          dataQuality: data.activity.dataQuality,
          notes: data.activity.sourceReference,
        };
      } else if (data.methodology === "direct-measure") {
        inventoryValue.gasValues = [
          {
            gas: "CO2",
            gasAmount: BigInt(data.direct.co2Emissions) * 1000n,
          },
          {
            gas: "CH4",
            gasAmount: BigInt(data.direct.ch4Emissions) * 1000n,
          },
          {
            gas: "N2O",
            gasAmount: BigInt(data.direct.n2oEmissions) * 1000n,
          },
        ];
        inventoryValue.dataSource = {
          sourceType: "user",
          dataQuality: data.direct.dataQuality,
          notes: data.direct.sourceReference,
        };
      } else {
        logger.error(
          `Methodology for subcategory ${subCategoryId} not selected!`,
        );
        return Promise.resolve();
      }

      const result = await setInventoryValue({
        subCategoryId: subCategoryId,
        inventoryId: inventoryId!,
        data: inventoryValue,
      });
      logger.info("Save result", result);
    }
  };

  return (
    <Box className="space-y-6">
      <Heading size="sm" className="font-normal">
        {t("select-methodology")}{" "}
        <Tooltip
          hasArrow
          label={t("methodology-tooltip")}
          bg="content.secondary"
          color="base.light"
          placement="bottom-start"
        >
          <InfoOutlineIcon mt={-0.5} color="content.tertiary" />
        </Tooltip>
      </Heading>
      <HStack spacing={4} {...getMethodologyRootProps()}>
        <RadioButton {...getMethodologyRadioProps({ value: "activity-data" })}>
          {t("activity-data")}
        </RadioButton>
        <RadioButton {...getMethodologyRadioProps({ value: "direct-measure" })}>
          {t("direct-measure")}
        </RadioButton>
      </HStack>
      {/*** Activity data ***/}
      {methodology === "activity-data" && (
        <ActivityDataTab
          t={t}
          register={register}
          errors={errors}
          prefix="activity."
          watch={watch}
          sectorNumber={sectorNumber}
        />
      )}
      {/*** Direct measure ***/}
      {methodology === "direct-measure" && (
        <DirectMeasureForm
          t={t}
          register={register}
          errors={errors}
          prefix="direct."
        />
      )}
    </Box>
  );
}
