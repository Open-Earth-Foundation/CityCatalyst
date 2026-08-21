"use client";

import { api, useUpdateActivityValueMutation } from "@/services/api";
import { Button, DialogOpenChangeDetails } from "@chakra-ui/react";
import { Dispatch, FC, SetStateAction } from "react";
import { Control, FieldValues, SubmitHandler } from "react-hook-form";
import { TFunction } from "i18next";
import { getInputMethodology } from "@/util/helpers";
import type { SuggestedActivity } from "@/util/form-schema";
import type { ManualValidationErrorDetails } from "@/lib/custom-errors/manual-input-error";
import ActivityModalBody, { Inputs } from "./activity-modal-body";
import { ActivityValue } from "@/models/ActivityValue";
import { InventoryValue } from "@/models/InventoryValue";
import useActivityValueValidation from "@/hooks/activity-value-form/use-activity-validation";
import useActivityForm, {
  generateDefaultActivityFormValues,
} from "@/hooks/activity-value-form/use-activity-form";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import useEmissionFactors from "@/hooks/activity-value-form/use-emission-factors";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { trackEvent } from "@/lib/analytics";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";

interface AddActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  defaultCityId?: string;
  setHasActivityData: Dispatch<SetStateAction<boolean>>;
  hasActivityData: boolean;
  inventoryId: string;
  // Can be Methodology | DirectMeasure at runtime (see activity-tab.tsx),
  // but internal usage here assumes Methodology-only fields (activitySelectionField,
  // fields, etc.) without narrowing -- needs a proper fix reconciling the two shapes
  // across this file, use-activity-form.ts, and emission-data-section.tsx.
  methodology: any;
  selectedActivity?: SuggestedActivity;
  referenceNumber: string;
  edit?: boolean;
  targetActivityValue?: ActivityValue;
  inventoryValue?: InventoryValue | null;
  resetSelectedActivityValue: () => void;
  setAddActivityDialogOpen: Dispatch<SetStateAction<boolean>>;
}

type ActivityData = Inputs["activity"] & Record<string, unknown>;

type ActivityValueErrorResponse = {
  error?: {
    type?: string;
    issues: ManualValidationErrorDetails;
    data?: { type?: string; errorKey: string };
  };
};

const AddActivityModal: FC<AddActivityModalProps> = ({
  isOpen,
  onClose,
  edit,
  t,
  setHasActivityData,
  hasActivityData,
  inventoryValue,
  inventoryId,
  methodology,
  selectedActivity,
  referenceNumber,
  targetActivityValue,
  resetSelectedActivityValue,
  setAddActivityDialogOpen,
}) => {
  const {
    fields,
    units,
    title,
    activityId,
    setValue,
    setFocus,
    reset,
    handleSubmit,
    register,
    watch,
    errors,
    setError,
    clearErrors,
    control,
    hideEmissionFactors,
    getValues,
  } = useActivityForm({
    targetActivityValue,
    selectedActivity,
    methodology: methodology,
  });

  // watch all the stored values

  const {
    emissionsFactorTypes,
    emissionsFactorsLoading: areEmissionFactorsLoading,
  } = useEmissionFactors({
    control,
    setValue,
    methodologyId: methodology?.id,
    referenceNumber,
    inventoryId,
    fields: fields,
  });

  const { handleManalInputValidationError } = useActivityValueValidation({
    t,
    setError,
    setFocus,
  });

  const submit = () => {
    handleSubmit(onSubmit)();
  };

  const [createActivityValue, { isLoading }] =
    api.useCreateActivityValueMutation();

  const [updateActivityValue, { isLoading: updateLoading }] =
    useUpdateActivityValueMutation();

  const { showErrorToast } = UseErrorToast({
    title: t("activity-value-error"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("activity-value-success"),
    duration: 1200,
  });

  function extractGasesAndUnits(data: ActivityData): {
    gas: string;
    factor: number;
    unit: string;
    emissionFactorId?: string;
  }[] {
    // two sets of logic for edit and create
    if (edit) {
      // make use of the gases in the targetActivityValue
      const gasArray: { gas: string; factor: number; unit: string }[] = [];
      targetActivityValue?.gasValues.forEach((gasValue) => {
        const gasObject = {
          ...gasValue,
          gas: gasValue.gas as string,
          factor: parseFloat(data[`${gasValue.gas}EmissionFactor`] as string),
          unit: data[
            `${gasValue.gas?.toLocaleLowerCase()}EmissionFactorUnit`
          ] as string,
        };
        gasArray.push(gasObject);
      });
      return gasArray;
    }
    const gases = ["CH4", "CO2", "N2O"];
    const gasArray: { gas: string; factor: number; unit: string }[] = [];
    gases.forEach((gas) => {
      const gasFactorKey = `${gas}EmissionFactor`;
      const gasUnitKey = `${gas?.toLocaleLowerCase()}EmissionFactorUnit`;
      const gasObject = {
        gas: gas,
        factor: parseFloat(data[gasFactorKey] as string),
        unit: data[gasUnitKey] as string,
      };

      gasArray.push(gasObject);
    });
    return gasArray;
  }

  const onSubmit: SubmitHandler<Inputs> = async ({ activity }) => {
    const gasValues = extractGasesAndUnits(activity);

    // extract field values
    const values: Record<string, unknown> = {};
    const activityData = activity as ActivityData;
    fields?.forEach((field) => {
      if (field.id in activity) {
        values[field.id] = activityData[field.id];
      }
      if (field.units) {
        values[`${field.id}-unit`] = activityData[`${field.id}-unit`];
      }
    });
    if (!methodology?.id.includes("direct-measure")) {
      values[title] = activityData[title];
      values[`${title}-unit`] = activityData[`${title}-unit`];
    }

    const requestData = {
      activityData: methodology?.id.includes("direct-measure")
        ? {
            ch4_amount: gasValues.find((g) => g.gas === "CH4")?.factor || 0,
            co2_amount: gasValues.find((g) => g.gas === "CO2")?.factor || 0,
            n2o_amount: gasValues.find((g) => g.gas === "N2O")?.factor || 0,
            ch4_unit: gasValues.find((g) => g.gas === "CH4")?.unit || "",
            co2_unit: gasValues.find((g) => g.gas === "CO2")?.unit || "",
            n2o_unit: gasValues.find((g) => g.gas === "N2O")?.unit || "",
            ...values,
          }
        : { ...values },
      metadata: {
        emissionFactorType: activity.emissionFactorType,
        emissionFactorTypeReference: activity.emissionFactorReference,
        emissionFactorName: activity.emissionFactorName,
        activityId: activityId,
        activityTitle: title,
        ...(methodology.activitySelectionField && {
          [methodology.activitySelectionField.id]: activityData[
            methodology.activitySelectionField.id
          ],
        }),
        dataQuality: activity.dataQuality,
        sourceExplanation: activity.dataComments,
        ...(activity.wasteCompositionType && {
          wasteCompositionType: activity.wasteCompositionType,
        }),
      },
      ...(inventoryValue ? { inventoryValueId: inventoryValue.id } : {}),
      ...(!inventoryValue
        ? {
            inventoryValue: {
              inputMethodology: getInputMethodology(methodology?.id), // extract methodology name
              gpcReferenceNumber: referenceNumber,
              unavailableReason: "",
              unavailableExplanation: "",
            },
          }
        : {}),
      gasValues: gasValues.map(({ gas, factor, unit, ...rest }) => ({
        ...rest,
        gas,
        emissionsFactor: {
          gas,
          units: unit ?? "",
          gpcReferenceNumber: referenceNumber,
          emissionsPerActivity: factor,
        },
      })),
    };

    let response = null;

    if (edit) {
      response = await updateActivityValue({
        inventoryId,
        valueId: targetActivityValue?.id,
        data: requestData,
      });
    } else {
      response = await createActivityValue({ inventoryId, requestData });
    }

    if (response.data) {
      // Track successful activity data submission
      trackEvent("activity_data_submitted", {
        action: edit ? "update" : "create",
        methodology_id: methodology?.id,
        reference_number: referenceNumber,
        inventory_id: inventoryId,
      });

      setHasActivityData(!hasActivityData);
      showSuccessToast();
      reset();
      onCloseDialog();
      resetSelectedActivityValue();
    } else {
      const error = response.error as FetchBaseQueryError;
      const errorData = error.data as ActivityValueErrorResponse;
      if (errorData.error?.type === "ManualInputValidationError") {
        handleManalInputValidationError(errorData.error.issues);
      } else if (errorData.error?.data?.type === "CalculationError") {
        showErrorToast({
          title: t("invalid-request"),
          description: t(errorData.error.data.errorKey),
        });
      } else {
        showErrorToast();
      }
    }
  };

  const onCloseDialog = () => {
    onClose();
    resetSelectedActivityValue();
    reset({
      activity: generateDefaultActivityFormValues(
        selectedActivity as SuggestedActivity,
        fields,
        methodology,
      ),
    });
  };

  return (
    <>
      <DialogRoot
        preventScroll
        open={isOpen}
        onOpenChange={(e: DialogOpenChangeDetails) =>
          setAddActivityDialogOpen(e.open)
        }
        onExitComplete={onCloseDialog}
      >
        <DialogBackdrop />
        <DialogContent
          data-testid="add-emission-modal"
          minH="300px"
          minW="768px"
          marginTop="2%"
        >
          <DialogHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            fontFamily="heading"
            lineHeight="32"
            padding="24px"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            {edit ? t("update-emission-data") : t("add-emission-data")}
          </DialogHeader>
          <DialogCloseTrigger />
          <ActivityModalBody
            emissionsFactorTypes={emissionsFactorTypes}
            inventoryId={inventoryId}
            areEmissionFactorsLoading={areEmissionFactorsLoading}
            title={title}
            hideEmissionFactors={hideEmissionFactors}
            submit={submit}
            register={register}
            watch={watch}
            control={control as unknown as Control<FieldValues>}
            fields={fields}
            units={units}
            targetActivityValue={targetActivityValue}
            methodology={methodology}
            selectedActivity={selectedActivity}
            getValues={getValues}
            t={t}
            errors={errors}
            setError={setError}
            clearErrors={clearErrors}
            setValue={setValue}
          />
          <DialogFooter
            borderTopWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
            w="full"
            display="flex"
            alignItems="center"
            p="24px"
            justifyContent="center"
          >
            <Button
              data-testid="add-emission-modal-submit"
              h="56px"
              w="full"
              paddingTop="16px"
              paddingBottom="16px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              loading={isLoading || updateLoading}
              onClick={submit}
              p={0}
              m={0}
            >
              {edit ? t("update-emission-data") : t("add-emission-data")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};

export default AddActivityModal;
