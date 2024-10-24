// take the methodology selected,

import { api } from "@/services/api";
import { ExtraField } from "@/util/form-schema";
import { useEffect, useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";
import { EmissionsFactorResponse } from "@/util/types";
import { getTranslationFromDict } from "@/i18n";

const reduceEmissionsToUniqueSourcesAndUnits = (
  emissionsFactors: EmissionsFactorResponse,
) => {
  const reducedMap: {
    [key: string]: {
      id: string;
      name: string;
      gasValuesByUnits: {
        [unit: string]: {
          unit: string;
          gasValues: Record<string, any>[];
        };
      };
    };
  } = {};

  emissionsFactors.forEach((factor) => {
    factor.dataSources.forEach((source) => {
      // Initialize the data source if it doesn't exist in reducedMap
      if (!reducedMap[source.datasourceId]) {
        reducedMap[source.datasourceId] = {
          id: source.datasourceId,
          name: getTranslationFromDict(source.datasetName) ?? "unknown",
          gasValuesByUnits: {},
        };
      }

      if (factor.units) {
        if (!reducedMap[source.datasourceId].gasValuesByUnits[factor.units]) {
          reducedMap[source.datasourceId].gasValuesByUnits[factor.units] = {
            unit: factor.units,
            gasValues: [],
          };
        }

        reducedMap[source.datasourceId].gasValuesByUnits[
          factor.units
        ].gasValues.push({
          ...factor,
          gas: factor.gas as string,
          emissionsPerActivity: factor.emissionsPerActivity as number,
          datasource: null,
        });
      }
    });
  });

  // Return the array of unique data sources with gas values grouped by units
  return Object.values(reducedMap).map((source) => ({
    ...source,
    gasValuesByUnits: Object.values(source.gasValuesByUnits),
  }));
};
const generateMetadataKey = (key: string) => {
  if (key.includes("fuel-type")) {
    return "fuel_type";
  } else if (key.includes("transport-type") || key.includes("vehicle-type")) {
    return "transport_type";
  } else if (key.includes("fugitive-emissions")) {
    return "activity_name";
  }
};

const useEmissionFactors = ({
  referenceNumber,
  methodologyId,
  inventoryId,
  control,
  fields,
  setValue,
}: {
  referenceNumber: string;
  methodologyId: string;
  inventoryId: string;
  control: Control<any, any>;
  fields: ExtraField[];
  setValue: UseFormSetValue<any>;
}) => {
  const activityData = useWatch({
    control,
    name: `activity` as any,
  });

  const emissionFactorMetadata = useMemo(() => {
    const metadata = fields.reduce(
      (acc, field) => {
        if (
          field["emission-factor-dependency"] &&
          activityData &&
          field.id in activityData
        ) {
          let key = generateMetadataKey(field.id) as string;
          acc[key] = activityData[field.id];
        }
        return acc;
      },
      {} as Record<string, ExtraField>,
    );
    return metadata;
  }, [activityData]);

  let { data: emissionsFactors, isLoading: emissionsFactorsLoading } =
    api.useGetEmissionsFactorsQuery({
      referenceNumber,
      methodologyId,
      inventoryId,
      metadata: emissionFactorMetadata,
    });

  const emissionsFactorTypes = useMemo(() => {
    if (!emissionsFactors) {
      return [];
    }

    // now that we have three or more emission factors, we want to reduce it down to a collection of gases per dataset
    return reduceEmissionsToUniqueSourcesAndUnits(emissionsFactors);
  }, [emissionsFactors]);

  console.log(emissionsFactorTypes, "emission factor types");

  // when the data changes we wanna set the emissions factor types to the first selection that exists.
  useEffect(() => {
    console.log(emissionsFactorTypes, "they changed");
    // if (emissionsFactorTypes.length > 0) {
    //   setValue("activity.emissionFactorType", emissionsFactorTypes[0].id);
    // }
  }, [emissionsFactorTypes]);

  return {
    emissionsFactorTypes,
    emissionsFactorsLoading,
  };
};

export default useEmissionFactors;
