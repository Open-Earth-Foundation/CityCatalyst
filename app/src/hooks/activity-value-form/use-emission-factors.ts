import { api } from "@/services/api";
import { ExtraField } from "@/util/form-schema";
import { useMemo } from "react";
import { Control, UseFormSetValue, useWatch } from "react-hook-form";
import { EmissionsFactorResponse } from "@/util/types";
import { getTranslationFromDict } from "@/i18n";
import { uniqBy } from "lodash";

export interface EmissionFactorTypes {
  id: string;
  name: string;
  reference: string;
  gasValuesByGas: {
    [gas: string]: {
      gasValues: Record<string, any>[];
    };
  };
}

const reduceEmissionsToUniqueSourcesAndUnits = (
  emissionsFactors: EmissionsFactorResponse,
) => {
  const reducedMap: {
    [key: string]: EmissionFactorTypes;
  } = {};

  emissionsFactors.forEach((factor) => {
    factor.dataSources.forEach((source) => {
      // Initialize the data source if it doesn't exist in reducedMap
      if (!reducedMap[source.datasourceId]) {
        reducedMap[source.datasourceId] = {
          id: source.datasourceId,
          name: getTranslationFromDict(source.datasetName) ?? "unknown",
          reference: factor.reference as string,
          gasValuesByGas: {},
        };
      }

      if (factor.gas) {
        if (!reducedMap[source.datasourceId].gasValuesByGas[factor.gas]) {
          reducedMap[source.datasourceId].gasValuesByGas[factor.gas] = {
            gasValues: [],
          };
        }

        reducedMap[source.datasourceId].gasValuesByGas[
          factor.gas
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
    gasValuesByGas: Object.keys(source.gasValuesByGas).reduce(
      (acc, currentValue) => {
        return {
          ...acc,
          [currentValue]: {
            gasValues: uniqBy(
              source.gasValuesByGas[currentValue].gasValues,
              "emissionsPerActivity",
            ).filter((factor) =>
              ["kg/m3", "kg/kWh", "kg/kg"].includes(factor.units),
            ), // filter only emissions that have kg/m3, kg/kWh, or kg/kg as the unit
          },
        };
      },
      {},
    ),
  }));
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
          acc[field.id] = activityData[field.id];
        }
        return acc;
      },
      {} as Record<string, ExtraField>,
    );
    return metadata;
  }, [activityData, fields]);

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

  return {
    emissionsFactorTypes,
    emissionsFactorsLoading,
  };
};

export default useEmissionFactors;
