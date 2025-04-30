import { InventoryWithInventoryValuesAndActivityValues } from "@/util/types";
import { sortGpcReferenceNumbers, toDecimal } from "@/util/helpers";
import Decimal from "decimal.js";
import { translationFunc } from "@/i18n/server";
import { stringify } from "csv-stringify/sync";
import { db } from "@/models";
import { MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";

export default class CSVDownloadService {
  public static async downloadCSV(
    output: InventoryWithInventoryValuesAndActivityValues,
    lng: string,
  ) {
    const headers = [
      "Inventory Reference",
      "GPC Reference Number",
      "Subsector name",
      "Notation Key",
      "Total Emissions",
      "Total Emission Units",
      "Activity type",
      "Activity Value",
      "Activity Units",
      "Emission Factor - CO2",
      "Emission Factor - CH4",
      "Emission Factor - N2O",
      "Emission Factor - Unit",
      "CO2 Emissions",
      "CH4 Emissions",
      "N2O Emissions",
      "Datasource ID",
      "DataSource name",
    ];

    const { t } = await translationFunc(lng, "data");

    // prepare the data
    const dataDictionary = this.prepDataForCSV(output, t);

    const sortedKeys = sortGpcReferenceNumbers(Object.keys(dataDictionary));

    const gasToCO2Eqs = await db.models.GasToCO2Eq.findAll();
    const gwps = gasToCO2Eqs.reduce(
      (acc, curr) => {
        acc[curr.gas] = {
          co2eqPerKg: curr.co2eqPerKg,
          co2eqYears: curr.co2eqYears,
        };
        return acc;
      },
      {} as Record<
        string,
        { co2eqPerKg: number | undefined; co2eqYears: number | undefined }
      >,
    );

    const inventoryLines = sortedKeys.flatMap((key) => {
      const value = dataDictionary[key];
      return value.activityValues.map((activityValue) => {
        return [
          value.inventory_reference || "N/A",
          value.gpc_reference_number,
          value.subsector_name,
          value.notation_key,
          activityValue.total_co2e,
          "t CO2e",
          activityValue.activity_type,
          activityValue.activity_amount,
          activityValue.activity_unit,
          activityValue.emission_factor_co2,
          activityValue.emission_factor_ch4,
          activityValue.emission_factor_n2o,
          activityValue.emission_factor_unit,
          Decimal.mul(
            (activityValue?.emission_co2 as any) ?? 0,
            gwps["CO2"].co2eqPerKg ?? 0,
          ).toNumber(),
          Decimal.mul(
            (activityValue?.emission_ch4 as any) ?? 0,
            gwps["CH4"].co2eqPerKg ?? 0,
          ).toNumber(),
          Decimal.mul(
            (activityValue?.emission_n2o as any) ?? 0,
            gwps["N2O"].co2eqPerKg ?? 0,
          ).toNumber(),
          activityValue.data_source_id,
          activityValue.data_source_name,
        ];
      });
    });

    const csvContent = stringify([...inventoryLines], {
      header: true,
      columns: headers,
      quoted: true,
    });
    try {
      return Buffer.from(csvContent);
    } catch (e) {
      console.error("Error creating CSV", e);
      throw new Error("Error creating CSV");
    }
  }

  public static prepDataForCSV(
    output: InventoryWithInventoryValuesAndActivityValues,
    t: (str: string) => string,
  ) {
    const inventoryValues = output.inventoryValues;
    const activityTypeKeyMapping = this.extractActivityTypeKey();

    const dataDictionary: Record<
      string,
      {
        inventory_reference?: string;
        gpc_reference_number?: string;
        subsector_name?: string;
        notation_key?: string;
        activityValues: {
          emission_factor_unit?: string | null;
          emission_factor_co2?: number | null;
          emission_factor_ch4?: number | null;
          emission_factor_n2o?: number | null;
          emission_co2?: bigint | null;
          emission_ch4?: bigint | null;
          emission_n2o?: bigint | null;
          activity_type?: string | null;
          activity_amount?: string | null;
          activity_unit?: string | null;
          data_source_id?: string;
          data_source_name?: string;
          total_co2e?: number;
        }[];
      }
    > = {};
    inventoryValues.forEach((inventoryValue) => {
      const gpcRefNo = inventoryValue.gpcReferenceNumber;
      const activityValues = inventoryValue.activityValues || [];

      const activityTypeKey =
        activityTypeKeyMapping[inventoryValue.gpcReferenceNumber as string]?.[
          inventoryValue.inputMethodology as string
        ];

      dataDictionary[gpcRefNo as string] = {
        // InventoryValue fields
        inventory_reference: inventoryValue.subCategoryId,
        gpc_reference_number: inventoryValue.gpcReferenceNumber,
        subsector_name: inventoryValue.subSector.subsectorName,
        notation_key: inventoryValue.unavailableReason?.split("-")?.[1],
        activityValues: activityValues.map((activityValue) => {
          let activityTitleKey = activityValue.metadata?.activityTitle;
          let activityType = activityValue.metadata?.activityId;
          let dataQuality = activityValue.metadata?.dataQuality;
          let dataSource = activityValue.activityData?.["data-source"];
          let activityAmount =
            activityValue.activityData?.[activityTitleKey] ??
            activityValue.activityData?.["activity-value"];
          let activityUnit = t(
            activityValue.activityData?.[`${activityTitleKey}-unit`] ??
              activityValue.activityData?.["activity-unit"],
          );
          let emission_factor_ch4 = null;
          let emission_factor_co2 = null;
          let emission_factor_n2o = null;
          let emission_co2 = null;
          let emission_ch4 = null;
          let emission_n2o = null;

          if (activityValue.gasValues) {
            let co2_gas = activityValue.gasValues.find((g) => g.gas === "CO2");
            let ch4_gas = activityValue.gasValues.find((g) => g.gas === "CH4");
            let n2o_gas = activityValue.gasValues.find((g) => g.gas === "N2O");

            emission_factor_co2 =
              co2_gas?.emissionsFactor?.emissionsPerActivity;
            emission_factor_ch4 =
              ch4_gas?.emissionsFactor?.emissionsPerActivity;
            emission_factor_n2o =
              n2o_gas?.emissionsFactor?.emissionsPerActivity;
            emission_ch4 = ch4_gas?.gasAmount;
            emission_co2 = co2_gas?.gasAmount;
            emission_n2o = n2o_gas?.gasAmount;
          }
          // if there is an existing emission factor value
          let usesEmissionFactor =
            inventoryValue.gpcReferenceNumber?.split(".")?.includes("I") ||
            inventoryValue.gpcReferenceNumber?.split(".").includes("II");
          let efUnit = null;

          if (usesEmissionFactor) {
            let scope = inventoryValue.gpcReferenceNumber?.split(".")[2];
            efUnit = scope === "1" ? "kg/m3" : "kg/TJ";
          }

          return {
            activity_type: t(activityValue?.activityData?.[activityTypeKey]),
            emission_factor_unit: efUnit,
            emission_factor_co2,
            emission_factor_ch4,
            emission_factor_n2o,
            emission_co2: emission_co2,
            emission_ch4: emission_ch4,
            emission_n2o: emission_n2o,
            activity_amount: activityAmount,
            activity_unit: activityUnit,
            data_source_id: inventoryValue.dataSource?.datasourceId,
            data_source_name:
              inventoryValue.dataSource?.datasourceName ?? dataSource,
            total_co2e: toDecimal(activityValue.co2eq as bigint)
              ?.div(new Decimal("1e3"))
              .toNumber(),
          };
        }),
      };

      if (dataDictionary[gpcRefNo as string].notation_key) {
        dataDictionary[gpcRefNo as string].activityValues = [{}];
      }
    });
    return dataDictionary;
  }

  public static extractActivityTypeKey(): Record<
    string,
    Record<string, string>
  > {
    const subsectorKeys = Object.keys(MANUAL_INPUT_HIERARCHY);
    const result: Record<string, Record<string, string>> = {};
    for (let subsectorKey of subsectorKeys) {
      let methodologyMapping: Record<string, string> = {};
      const subsector = MANUAL_INPUT_HIERARCHY[subsectorKey];
      if (
        "methodologies" in subsector &&
        Array.isArray(subsector.methodologies)
      ) {
        for (let methodology of subsector.methodologies) {
          methodologyMapping[methodology.id] =
            methodology.activityTypeField as string;
        }
      }
      if ("directMeasure" in subsector && subsector.directMeasure) {
        methodologyMapping["direct-measure"] = subsector.directMeasure
          .activityTypeField as string;
      }

      result[subsectorKey] = methodologyMapping;
    }
    return result;
  }
}
