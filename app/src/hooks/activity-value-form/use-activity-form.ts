import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { ActivityValue } from "@/models/ActivityValue";
import { SuggestedActivity } from "@/util/form-schema";
import { Inputs } from "@/components/Modals/activity-modal/activity-modal-body";

export const generateDefaultActivityFormValues = (
  selectedActivity: SuggestedActivity,
) => {
  return {
    activityType: selectedActivity?.id,
    fuelType: "",
    dataQuality: "",
    sourceReference: "",
    CH4EmissionFactor: 0,
    CO2EmissionFactor: 0,
    N2OEmissionFactor: 0,
    emissionFactorType: "",
    totalFuelConsumption: "",
    totalFuelConsumptionUnits: "",
    co2EmissionFactorUnit: "",
    n2oEmissionFactorUnit: "",
    ch4EmissionFactorUnit: "",
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
  methodologyName,
}: {
  targetActivityValue: ActivityValue | undefined;
  selectedActivity?: SuggestedActivity;
  methodologyName?: string;
}) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<Inputs>();

  useEffect(() => {
    if (targetActivityValue) {
      reset({
        activity: {
          ...targetActivityValue.activityData,
          dataQuality: targetActivityValue?.dataSource?.dataQuality,
          sourceReference: targetActivityValue?.dataSource?.notes,
          CH4EmissionFactor:
            methodologyName === "direct-measure"
              ? targetActivityValue?.activityData?.ch4_amount
              : extractGasAmount("CH4", targetActivityValue).amount,
          CO2EmissionFactor:
            methodologyName === "direct-measure"
              ? targetActivityValue?.activityData?.co2_amount
              : extractGasAmount("CO2", targetActivityValue).amount,
          N2OEmissionFactor:
            methodologyName === "direct-measure"
              ? targetActivityValue?.activityData?.n2o_amount
              : extractGasAmount("N2O", targetActivityValue).amount,
          emissionFactorType: targetActivityValue.metadata?.emissionFactorType, // TODO confirm the source of this value
          totalFuelConsumption:
            targetActivityValue?.metadata?.totalFuelConsumption, // TODO confirm the source of this value
          totalFuelConsumptionUnits:
            targetActivityValue?.activityData?.totalFuelConsumptionUnits,
          co2EmissionFactorUnit: extractGasAmount("CO2", targetActivityValue)
            .units,
          n2oEmissionFactorUnit: extractGasAmount("N2O", targetActivityValue)
            .units,
          ch4EmissionFactorUnit: extractGasAmount("CH4", targetActivityValue)
            .units,
        },
      });
    } else {
      reset({
        activity: generateDefaultActivityFormValues(
          selectedActivity as SuggestedActivity,
        ),
      });
    }
  }, [targetActivityValue, selectedActivity]);

  return {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    setFocus,
    errors,
  };
};

export default useActivityForm;
