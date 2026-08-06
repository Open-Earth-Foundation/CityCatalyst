import { Path, useForm } from "react-hook-form";
import { useEffect, useMemo } from "react";
import { ActivityValue } from "@/models/ActivityValue";
import { ExtraField, Methodology, SuggestedActivity } from "@/util/form-schema";
import { Inputs } from "@/components/Modals/activity-modal/activity-modal-body";

export const generateDefaultActivityFormValues = (
  selectedActivity: SuggestedActivity,
  fields: ExtraField[],
  methodology: Methodology,
) => {
  return {
    activityType: selectedActivity?.id,
    ...(fields
      ? {
          ...fields.reduce((acc: Record<string, unknown>, field) => {
            acc[field.id] = field.multiselect
              ? []
              : field.type === "number"
                ? 0
                : "";
            return acc;
          }, {}),
        }
      : {}),
    ...(methodology.activitySelectionField && {
      [methodology.activitySelectionField.id]:
        selectedActivity?.prefills?.[0].value ||
        methodology.activitySelectionField.options[0], // TODO using the selected activity's first prefill value should be more dynamic
    }),
    fuelType: "",
    dataQuality: "",
    dataComments: "",
    CH4EmissionFactor: 0,
    CO2EmissionFactor: 0,
    N2OEmissionFactor: 0,
    emissionFactorType: "",
    emissionFactorTypeReference: "",
    emissionsFactorName: "",
    co2EmissionFactorUnit: "",
    n2oEmissionFactorUnit: "",
    ch4EmissionFactorUnit: "",
    wasteCompositionType: null,
  };
};

const extractGasAmount = (gas: string, activity: ActivityValue) => {
  const emissionsFactor = activity.gasValues.find(
    (g) => g.gas === gas,
  )?.emissionsFactor;

  return {
    amount: emissionsFactor ? emissionsFactor.emissionsPerActivity : 0,
    units: emissionsFactor ? emissionsFactor.units : "",
  };
};
const useActivityForm = ({
  targetActivityValue,
  selectedActivity,
  methodology,
}: {
  targetActivityValue: ActivityValue | undefined;
  selectedActivity?: SuggestedActivity;
  methodology: Methodology;
}) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    setFocus,
    setValue,
    control,
    getValues,
    formState: { errors },
  } = useForm<Inputs>();

  const selectedActivityOption = watch(
    `activity.${methodology.activitySelectionField?.id as string}` as Path<Inputs>,
  );

  const { fields, units, title, activityId, hideEmissionFactors } =
    useMemo(() => {
      let fields: ExtraField[] = [];
      let units = null;
      let title = "";
      let activityId = null;
      let hideEmissionFactors = false;

      if (methodology?.id.includes("direct-measure")) {
        fields = methodology.fields as ExtraField[];
      } else {
        const foundIndex =
          methodology.fields?.findIndex(
            (ac) => ac.activitySelectedOption === selectedActivityOption,
          ) ?? 0;

        const selectedActivityIndex = foundIndex >= 0 ? foundIndex : 0;

        hideEmissionFactors =
          methodology?.fields?.[selectedActivityIndex].hideEmissionFactorsInput;
        fields = methodology?.fields?.[selectedActivityIndex][
          "extra-fields"
        ] as ExtraField[];
        units = methodology?.fields?.[selectedActivityIndex].units;
        title = methodology?.fields?.[selectedActivityIndex][
          "activity-title"
        ] as string;
        activityId = methodology?.fields?.[selectedActivityIndex]["id"];
      }

      return {
        fields,
        units,
        title,
        hideEmissionFactors,
        activityId,
      };
    }, [methodology, selectedActivityOption]);

  useEffect(() => {
    if (targetActivityValue) {
      reset({
        activity: {
          ...targetActivityValue.activityData,
          ...(methodology.activitySelectionField && {
            [methodology.activitySelectionField.id]:
              targetActivityValue.metadata?.[
                methodology.activitySelectionField.id
              ],
          }),
          dataQuality: targetActivityValue?.metadata?.dataQuality as
            | string
            | undefined,
          dataComments: targetActivityValue?.metadata?.sourceExplanation as
            | string
            | undefined,
          CH4EmissionFactor: (methodology.id === "direct-measure"
            ? targetActivityValue?.activityData?.ch4_amount
            : extractGasAmount("CH4", targetActivityValue).amount) as
            | number
            | undefined,
          CO2EmissionFactor: (methodology.id === "direct-measure"
            ? targetActivityValue?.activityData?.co2_amount
            : extractGasAmount("CO2", targetActivityValue).amount) as
            | number
            | undefined,
          N2OEmissionFactor: (methodology.id === "direct-measure"
            ? targetActivityValue?.activityData?.n2o_amount
            : extractGasAmount("N2O", targetActivityValue).amount) as
            | number
            | undefined,
          emissionFactorType: targetActivityValue.metadata?.emissionFactorType as
            | string
            | undefined,
          emissionFactorReference: targetActivityValue.metadata
            ?.emissionFactorTypeReference as string | undefined,
          emissionFactorName: targetActivityValue.metadata
            ?.emissionFactorName as string | undefined,
          co2EmissionFactorUnit: extractGasAmount("CO2", targetActivityValue)
            .units,
          n2oEmissionFactorUnit: extractGasAmount("N2O", targetActivityValue)
            .units,
          ch4EmissionFactorUnit: extractGasAmount("CH4", targetActivityValue)
            .units,
          wasteCompositionType: (targetActivityValue.metadata
            ?.wasteCompositionType || null) as string | null,
        },
      });
    } else {
      reset({
        activity: generateDefaultActivityFormValues(
          selectedActivity as SuggestedActivity,
          fields,
          methodology as Methodology,
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetActivityValue, selectedActivity, methodology]);

  return {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    setFocus,
    errors,
    control,
    setValue,
    getValues,
    fields,
    units,
    title,
    activityId,
    hideEmissionFactors,
  };
};

export default useActivityForm;
