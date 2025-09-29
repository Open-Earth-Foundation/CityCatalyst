import { useEffect, useState } from "react";
import { TFunction } from "i18next";
import {
  Control,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetValue,
  useWatch,
} from "react-hook-form";
import type {
  DirectMeasureData,
  SubcategoryData,
} from "../../../app/[lng]/[inventory]/data/[step]/types";
import { ExtraField, Methodology, SuggestedActivity } from "@/util/form-schema";
import { ActivityValue } from "@/models/ActivityValue";
import { EmissionFactorTypes } from "@/hooks/activity-value-form/use-emission-factors";
import { DialogBody } from "@/components/ui/dialog";
import { ActivitySelectionSection } from "./sections/ActivitySelectionSection";
import { DynamicFieldsSection } from "./sections/DynamicFieldsSection";
import { ActivityDataSection } from "./sections/ActivityDataSection";
import { DirectMeasureSection } from "./sections/DirectMeasureSection";
import { EmissionFactorsSection } from "./sections/EmissionFactorsSection";
import { DataQualitySection } from "./sections/DataQualitySection";

interface AddActivityModalBodyProps {
  t: TFunction;
  register: UseFormRegister<Inputs>;
  watch: Function;
  control: Control<any, any>;
  submit: () => void;
  fields: ExtraField[];
  hideEmissionFactors?: boolean;
  units?: string[];
  errors: Record<string, any>;
  setError: Function;
  clearErrors: Function;
  emissionsFactorTypes: EmissionFactorTypes[];
  methodology: Methodology;
  selectedActivity?: SuggestedActivity;
  targetActivityValue?: ActivityValue;
  setValue: UseFormSetValue<Inputs>;
  getValues: UseFormGetValues<Inputs>;
  title: string; // Title of the field
  areEmissionFactorsLoading: boolean;
  inventoryId?: string;
}

export type Inputs = {
  activity: {
    activityDataAmount?: number | null | undefined;
    activityDataUnit?: string | null | undefined;
    emissionFactorType?: string;
    emissionFactorReference?: string;
    emissionFactorName?: string;
    CO2EmissionFactor: number;
    N2OEmissionFactor: number;
    CH4EmissionFactor: number;
    dataQuality: string;
    dataComments: string;
    activityType: string;
    fuelType: string;
    co2EmissionFactorUnit: string;
    n2oEmissionFactorUnit: string;
    ch4EmissionFactorUnit: string;
    wasteCompositionType?: string;
  };
  direct: DirectMeasureData;
  subcategoryData: Record<string, SubcategoryData>;
};

const EMISSION_FACTOR_MAX = 100000;

const ActivityModalBody = ({
  t,
  register,
  control,
  submit,
  methodology,
  emissionsFactorTypes,
  errors,
  setError,
  clearErrors,
  fields,
  units,
  targetActivityValue,
  selectedActivity,
  title,
  hideEmissionFactors,
  setValue,
  getValues,
  areEmissionFactorsLoading,
  inventoryId,
}: AddActivityModalBodyProps) => {
  const unitValue = useWatch({
    control,
    name: `activity.${title}-unit` as any,
  });

  const emissionsFactorTypeValue = useWatch({
    control,
    name: "activity.emissionFactorType",
  });

  // Watch emission factor values for validation
  const co2EmissionFactor = useWatch({
    control,
    name: "activity.CO2EmissionFactor",
  });

  const n2oEmissionFactor = useWatch({
    control,
    name: "activity.N2OEmissionFactor",
  });

  const ch4EmissionFactor = useWatch({
    control,
    name: "activity.CH4EmissionFactor",
  });

  const [isEmissionFactorInputDisabled, setIsEmissionFactorInputDisabled] =
    useState<boolean>(true);

  // Function to determine default units based on methodology type
  const getDefaultUnits = (methodologyId: string): string => {
    if (
      methodologyId.includes("energy-consumption") ||
      methodologyId.includes("electricity-consumption")
    ) {
      return "kg/kWh";
    }
    return "kg/m3"; // Default for fuel combustion and other activities
  };

  // State to store the current emission factor units
  const [emissionFactorUnits, setEmissionFactorUnits] = useState<string>(
    getDefaultUnits(methodology.id),
  );

  useEffect(() => {
    setIsEmissionFactorInputDisabled(emissionsFactorTypeValue !== "custom");
  }, [emissionsFactorTypeValue]);

  useEffect(() => {
    if (emissionsFactorTypes.length > 0 && emissionsFactorTypeValue) {
      const emissionFactor = emissionsFactorTypes.find(
        (factor) => factor.id === emissionsFactorTypeValue,
      );
      if (emissionsFactorTypeValue === "custom") {
        setValue(
          "activity.emissionFactorReference",
          t("custom-emission-factor-reference"),
        );
        setValue(
          "activity.emissionFactorName",
          t("custom-emission-factor-name"),
        );
        // Reset to default units for custom emission factors based on methodology
        const defaultUnits = getDefaultUnits(methodology.id);
        setValue("activity.co2EmissionFactorUnit", defaultUnits);
        setValue("activity.n2oEmissionFactorUnit", defaultUnits);
        setValue("activity.ch4EmissionFactorUnit", defaultUnits);
        setEmissionFactorUnits(defaultUnits);
        setIsEmissionFactorInputDisabled(false);
      } else {
        let co2Val =
          (emissionFactor?.gasValuesByGas["CO2"]?.gasValues.length as number) >
          0
            ? emissionFactor?.gasValuesByGas["CO2"].gasValues[0]
                .emissionsPerActivity
            : "";
        let n2oVal =
          (emissionFactor?.gasValuesByGas["N2O"]?.gasValues.length as number) >
          0
            ? emissionFactor?.gasValuesByGas["N2O"].gasValues[0]
                .emissionsPerActivity
            : "";
        let ch4Val =
          (emissionFactor?.gasValuesByGas["CH4"]?.gasValues.length as number) >
          0
            ? emissionFactor?.gasValuesByGas["CH4"].gasValues[0]
                .emissionsPerActivity
            : "";

        // Extract units from the first available gas value
        const methodologyDefaultUnits = getDefaultUnits(methodology.id);
        let units = methodologyDefaultUnits; // default fallback based on methodology
        if (
          emissionFactor?.gasValuesByGas["CO2"]?.gasValues.length &&
          emissionFactor.gasValuesByGas["CO2"].gasValues.length > 0
        ) {
          units =
            emissionFactor.gasValuesByGas["CO2"].gasValues[0].units ||
            methodologyDefaultUnits;
        } else if (
          emissionFactor?.gasValuesByGas["N2O"]?.gasValues.length &&
          emissionFactor.gasValuesByGas["N2O"].gasValues.length > 0
        ) {
          units =
            emissionFactor.gasValuesByGas["N2O"].gasValues[0].units ||
            methodologyDefaultUnits;
        } else if (
          emissionFactor?.gasValuesByGas["CH4"]?.gasValues.length &&
          emissionFactor.gasValuesByGas["CH4"].gasValues.length > 0
        ) {
          units =
            emissionFactor.gasValuesByGas["CH4"].gasValues[0].units ||
            methodologyDefaultUnits;
        }

        setValue("activity.CO2EmissionFactor", co2Val ? co2Val : 0);
        setValue("activity.N2OEmissionFactor", n2oVal ? n2oVal : 0);
        setValue("activity.CH4EmissionFactor", ch4Val ? ch4Val : 0);
        setValue("activity.emissionFactorName", emissionFactor?.name);
        setValue("activity.emissionFactorReference", emissionFactor?.reference);

        // Set the extracted units for each gas
        setValue("activity.co2EmissionFactorUnit", units);
        setValue("activity.n2oEmissionFactorUnit", units);
        setValue("activity.ch4EmissionFactorUnit", units);

        // Set the extracted units for display
        setEmissionFactorUnits(units);

        setIsEmissionFactorInputDisabled(true);
      }
    }
  }, [emissionsFactorTypes, emissionsFactorTypeValue, setValue, t]);

  // Validate emission factors in real-time (only when custom factor type is selected)
  useEffect(() => {
    const validateEmissionFactor = (value: number, fieldName: string) => {
      // Only validate if custom emission factor type is selected
      if (emissionsFactorTypeValue !== "custom") {
        clearErrors(`activity.${fieldName}`);
        return;
      }

      // Check if value is empty, null, undefined
      if (value === null || value === undefined) {
        setError(`activity.${fieldName}`, {
          type: "required",
          message: t("emission-factor-required"),
        });
      } else if (value < 0) {
        setError(`activity.${fieldName}`, {
          type: "min",
          message: t("emission-factor-negative"),
        });
      } else if (value > EMISSION_FACTOR_MAX) {
        setError(`activity.${fieldName}`, {
          type: "max",
          message: t("emission-factor-too-large", {
            max: EMISSION_FACTOR_MAX.toLocaleString(),
          }),
        });
      } else {
        clearErrors(`activity.${fieldName}`);
      }
    };

    validateEmissionFactor(co2EmissionFactor, "CO2EmissionFactor");
    validateEmissionFactor(n2oEmissionFactor, "N2OEmissionFactor");
    validateEmissionFactor(ch4EmissionFactor, "CH4EmissionFactor");
  }, [
    co2EmissionFactor,
    n2oEmissionFactor,
    ch4EmissionFactor,
    emissionsFactorTypeValue,
    setError,
    clearErrors,
    t,
  ]);

  const isDirectMeasure = methodology?.id.includes("direct-measure");

  return (
    <DialogBody p={6} px={12}>
      <form onSubmit={submit}>
        <ActivitySelectionSection
          t={t}
          control={control}
          methodology={methodology}
          selectedActivity={selectedActivity}
        />
        
        <DynamicFieldsSection
          t={t}
          register={register}
          control={control}
          fields={fields}
          errors={errors}
          setError={setError}
          clearErrors={clearErrors}
          selectedActivity={selectedActivity}
          setValue={setValue}
          getValues={getValues}
          inventoryId={inventoryId}
          methodologyId={methodology.id}
        />
        
        <ActivityDataSection
          t={t}
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          title={title}
          units={units}
          hideEmissionFactors={hideEmissionFactors}
          emissionsFactorTypes={emissionsFactorTypes}
          isDirectMeasure={isDirectMeasure}
        />
        
        <DirectMeasureSection
          t={t}
          control={control}
          errors={errors}
          isDirectMeasure={isDirectMeasure}
        />
        
        <EmissionFactorsSection
          t={t}
          control={control}
          errors={errors}
          isDirectMeasure={isDirectMeasure}
          hideEmissionFactors={hideEmissionFactors}
          isEmissionFactorInputDisabled={isEmissionFactorInputDisabled}
          emissionFactorUnits={emissionFactorUnits}
          areEmissionFactorsLoading={areEmissionFactorsLoading}
        />
        
        <DataQualitySection
          t={t}
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          fields={fields}
        />
      </form>
    </DialogBody>
  );
};

export default ActivityModalBody;
