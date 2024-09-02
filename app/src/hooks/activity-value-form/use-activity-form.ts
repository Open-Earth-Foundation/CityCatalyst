import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { ActivityValue } from "@/models/ActivityValue";
import { SuggestedActivity } from "@/util/form-schema";
import { Inputs } from "@/components/Modals/activity-modal/activity-modal-body";

const useActivityForm = ({
  targetActivityValue,
  selectedActivity,
}: {
  targetActivityValue: ActivityValue | undefined;
  selectedActivity?: SuggestedActivity;
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
          CH4EmissionFactor: targetActivityValue?.activityData?.ch4_amount,
          CO2EmissionFactor: targetActivityValue?.activityData?.co2_amount,
          N2OEmissionFactor: targetActivityValue?.activityData?.n2o_amount,
          activityDataAmount: 0,
          activityDataUnit: null,
          emissionFactorType: "",
          totalFuelConsumption: "",
          totalFuelConsumptionUnits: "",
          co2EmissionFactorUnit: "",
          n2oEmissionFactorUnit: "",
          ch4EmissionFactorUnit: "",
        },
      });
    } else {
      reset({
        activity: {
          activityType: selectedActivity?.id,
          fuelType: "",
          dataQuality: "",
          sourceReference: "",
          CH4EmissionFactor: 0,
          CO2EmissionFactor: 0,
          N2OEmissionFactor: 0,
          activityDataAmount: 0,
          activityDataUnit: null,
          emissionFactorType: "",
          totalFuelConsumption: "",
          totalFuelConsumptionUnits: "",
          co2EmissionFactorUnit: "",
          n2oEmissionFactorUnit: "",
          ch4EmissionFactorUnit: "",
        },
      });
    }
  }, [targetActivityValue]);

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
