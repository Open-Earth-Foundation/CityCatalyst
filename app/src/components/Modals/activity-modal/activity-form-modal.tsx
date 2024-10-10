"use client";

import { api, useUpdateActivityValueMutation } from "@/services/api";
import {
  Box,
  Button,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useToast,
} from "@chakra-ui/react";
import { FC, useMemo } from "react";
import { SubmitHandler } from "react-hook-form";
import { TFunction } from "i18next";
import { CheckCircleIcon } from "@chakra-ui/icons";
import { getInputMethodology } from "@/util/helpers";
import type { SuggestedActivity } from "@/util/form-schema";
import { getTranslationFromDict } from "@/i18n";
import ActivityModalBody, { ExtraField, Inputs } from "./activity-modal-body";
import { ActivityValue } from "@/models/ActivityValue";
import { InventoryValue } from "@/models/InventoryValue";
import useActivityValueValidation from "@/hooks/activity-value-form/use-activity-validation";
import useActivityForm, {
  generateDefaultActivityFormValues,
} from "@/hooks/activity-value-form/use-activity-form";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { EmissionsFactorResponse } from "@/util/types";

interface AddActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  defaultCityId?: string;
  setHasActivityData: Function;
  hasActivityData: boolean;
  inventoryId: string;
  methodology: any;
  selectedActivity?: SuggestedActivity;
  referenceNumber: string;
  edit?: boolean;
  targetActivityValue?: ActivityValue;
  inventoryValue?: InventoryValue | null;
  resetSelectedActivityValue: () => void;
}

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
}) => {
  const { fields, units, title, activityId } = useMemo(() => {
    let fields: ExtraField[] = [];
    let units = null;
    let title = null;
    let activityId = null;

    if (methodology?.id.includes("direct-measure")) {
      fields = methodology.fields;
    } else {
      fields = methodology?.fields[0]["extra-fields"];
      units = methodology?.fields[0].units;
      title = methodology?.fields[0]["activity-title"];
      activityId = methodology?.fields[0]["id"];
    }

    return {
      fields,
      units,
      title,
      activityId,
    };
  }, [methodology]);

  const {
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
    getValues,
  } = useActivityForm({
    targetActivityValue,
    selectedActivity,
    methodologyName: methodology?.id,
    fields,
  });

  const { handleManalInputValidationError } = useActivityValueValidation({
    t,
    setError,
    setFocus,
  });

  const submit = () => {
    handleSubmit(onSubmit)();
  };

  let { data: emissionsFactors, isLoading: emissionsFactorsLoading } =
    api.useGetEmissionsFactorsQuery({
      referenceNumber,
      methodologyId: methodology?.id,
      inventoryId,
    });

  const reduceEmissionsToUniqueSources = (
    emissionsFactors: EmissionsFactorResponse,
  ) => {
    const reducedMap: {
      [key: string]: {
        id: string;
        name: string;
        gasValues: { gas: string; emissionsPerActivity: number }[];
      };
    } = {};

    emissionsFactors.forEach((factor) => {
      factor.dataSources.forEach((source) => {
        if (!reducedMap[source.datasourceId]) {
          reducedMap[source.datasourceId] = {
            id: source.datasourceId,
            name: getTranslationFromDict(source.datasetName) ?? "unknown",
            gasValues: [],
          };
        }
        reducedMap[source.datasourceId].gasValues.push({
          gas: factor.gas as string,
          emissionsPerActivity: factor.emissionsPerActivity as number,
        });
      });
    });

    return Object.values(reducedMap);
  };

  const emissionsFactorTypes = useMemo(() => {
    if (!emissionsFactors) {
      return [];
    }

    // now that we have three or more emission factors, we want to reduce it down to a collection of gases per dataset
    return reduceEmissionsToUniqueSources(emissionsFactors);
  }, [emissionsFactors]);

  const toast = useToast();

  const [createActivityValue, { isLoading }] =
    api.useCreateActivityValueMutation();

  const [updateActivityValue, { isLoading: updateLoading }] =
    useUpdateActivityValueMutation();

  function extractGasesAndUnits(data: any): {
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
          factor: parseFloat(data[`${gasValue.gas}EmissionFactor`]),
          unit: gasValue.emissionsFactor.units as string,
        };
        gasArray.push(gasObject);
      });
      return gasArray;
    }
    const gases = ["CH4", "CO2", "N2O"];
    const gasArray: { gas: string; factor: number; unit: string }[] = [];
    gases.forEach((gas) => {
      const gasFactorKey = `${gas}EmissionFactor`;
      const gasUnitKey = `${gas}EmissionFactorUnit`;
      const gasObject = {
        gas: gas,
        factor: parseFloat(data[gasFactorKey]),
        unit: data[gasUnitKey],
      };

      gasArray.push(gasObject);
    });
    return gasArray;
  }

  const onSubmit: SubmitHandler<Inputs> = async ({ activity }) => {
    const gasValues = extractGasesAndUnits(activity);

    // extract field values
    const values: Record<string, any> = {};
    fields?.forEach((field) => {
      if (field.id in activity) {
        values[field.id] = (activity as any)[field.id];
      }
      if (field.units) {
        values[`${field.id}-unit`] = (activity as any)[`${field.id}-unit`];
      }
    });
    if (!methodology?.id.includes("direct-measure")) {
      values[title] = (activity as any)[title];
      values[`${title}-unit`] = (activity as any)[`${title}-unit`];
    }

    const requestData = {
      activityData: methodology?.id.includes("direct-measure")
        ? {
            co2_amount: gasValues[1].factor,
            ch4_amount: gasValues[0].factor,
            n2o_amount: gasValues[2].factor,
            ...values,
          }
        : { ...values },
      metadata: {
        emissionFactorType: activity.emissionFactorType,
        activityId: activityId,
        activityTitle: title,
        dataQuality: activity.dataQuality,
        sourceExplanation: activity.dataComments,
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
      setHasActivityData(!hasActivityData);
      toast({
        status: "success",
        duration: 1200,
        title: t("activity-value-success"),
        render: ({ title }) => (
          <Box
            h="48px"
            w="600px"
            borderRadius="8px"
            display="flex"
            alignItems="center"
            color="white"
            backgroundColor="interactive.primary"
            gap="8px"
            px="16px"
          >
            <CheckCircleIcon />
            <Text>{title}</Text>
          </Box>
        ),
      });
      reset();
      onClose();
      resetSelectedActivityValue();
    } else {
      const error = response.error as FetchBaseQueryError;
      const errorData = error.data as any;
      if (errorData.error?.type === "ManualInputValidationError") {
        handleManalInputValidationError(errorData.error.issues);
      } else {
        toast({
          status: "error",
          title: t("activity-value-error"),
        });
      }
    }
  };

  const closeModalFunc = () => {
    onClose();
    resetSelectedActivityValue();
    reset({
      activity: generateDefaultActivityFormValues(
        selectedActivity as SuggestedActivity,
        fields,
      ),
    });
  };

  return (
    <>
      <Modal
        blockScrollOnMount={false}
        isOpen={isOpen}
        onClose={closeModalFunc}
      >
        <ModalOverlay />
        <ModalContent
          data-testid="add-emission-modal"
          minH="300px"
          minW="768px"
          marginTop="2%"
        >
          <ModalHeader
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
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ActivityModalBody
            emissionsFactorTypes={emissionsFactorTypes}
            title={title}
            submit={submit}
            register={register}
            watch={watch}
            control={control}
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
          <ModalFooter
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
              isLoading={isLoading || updateLoading}
              onClick={submit}
              p={0}
              m={0}
            >
              {edit ? t("update-emission-data") : t("add-emission-data")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default AddActivityModal;
