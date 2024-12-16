import { InventoryWithInventoryValuesAndActivityValues } from "@/util/types";
import { sortGpcReferenceNumbers, toDecimal } from "@/util/helpers";
import Decimal from "decimal.js";
import { translationFunc } from "@/i18n/server";
import { stringify } from "csv-stringify/sync";

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
      "Activity Value",
      "Activity Units",
      "Emission Factor - CO2",
      "Emission Factor - CH4",
      "Emission Factor - N2O",
      "Emission Factor - Unit",
      "Datasource ID",
      "DataSource name",
    ];

    const { t } = await translationFunc(lng, "data");

    // prepare the data
    const dataDictionary = this.prepDataForCSV(output, t);

    const sortedKeys = sortGpcReferenceNumbers(Object.keys(dataDictionary));

    const inventoryLines = sortedKeys.flatMap((key) => {
      const value = dataDictionary[key];
      return value.activityValues.map((activityValue) => {
        return [
          value.inventory_reference || "N/A",
          value.gpc_reference_number,
          value.subsector_name,
          value.notation_key,
          activityValue.total_co2e,
          "kg CO2e",
          activityValue.activity_amount,
          activityValue.activity_unit,
          activityValue.emission_co2,
          activityValue.emission_ch4,
          activityValue.emission_n2o,
          activityValue.emission_factor_unit,
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

    const dataDictionary: Record<
      string,
      {
        inventory_reference?: string;
        gpc_reference_number?: string;
        subsector_name?: string;
        notation_key?: string;
        activityValues: {
          emission_factor_unit?: string | null;
          emission_co2?: number | null;
          emission_ch4?: number | null;
          emission_n2o?: number | null;
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

      // if there is a source, this is third party data
      if (inventoryValue.dataSource) {
        dataDictionary[gpcRefNo as string] = {
          inventory_reference: inventoryValue.subCategoryId,
          gpc_reference_number: inventoryValue.gpcReferenceNumber,
          subsector_name: inventoryValue.subSector.subsectorName,
          notation_key: inventoryValue.unavailableReason?.split("-")[1],
          activityValues: [
            {
              emission_factor_unit: null,
              emission_co2: null,
              emission_ch4: null,
              emission_n2o: null,
              activity_amount: null,
              activity_unit: null,
              data_source_id: inventoryValue.dataSource?.datasourceId,
              data_source_name: inventoryValue.dataSource?.datasourceName,
              total_co2e: toDecimal(inventoryValue.co2eq as bigint)
                ?.div(new Decimal("1e3"))
                .toNumber(),
            },
          ],
        };
      } else {
        dataDictionary[gpcRefNo as string] = {
          // InventoryValue fields
          inventory_reference: inventoryValue.subCategoryId,
          gpc_reference_number: inventoryValue.gpcReferenceNumber,
          subsector_name: inventoryValue.subSector.subsectorName,
          notation_key: inventoryValue.unavailableReason?.split("-")[1],
          activityValues: activityValues.map((activityValue) => {
            let activityTitleKey = activityValue.metadata?.activityTitle;
            let dataQuality = activityValue.metadata?.dataQuality;
            let dataSource = activityValue.activityData?.["data-source"];
            let activityAmount = activityValue.activityData?.[activityTitleKey];
            let activityUnit = t(
              activityValue.activityData?.[`${activityTitleKey}-unit`],
            );
            let emission_co2 = null;
            let emission_ch4 = null;
            let emission_n2o = null;

            if (activityValue.gasValues) {
              let co2_gas = activityValue.gasValues.find(
                (g) => g.gas === "CO2",
              );
              let ch4_gas = activityValue.gasValues.find(
                (g) => g.gas === "CH4",
              );
              let n2o_gas = activityValue.gasValues.find(
                (g) => g.gas === "N2O",
              );

              emission_co2 = co2_gas?.emissionsFactor.emissionsPerActivity;
              emission_ch4 = ch4_gas?.emissionsFactor.emissionsPerActivity;
              emission_n2o = n2o_gas?.emissionsFactor.emissionsPerActivity;
            }
            // if there is an existing emission factor value
            let usesEf =
              inventoryValue.gpcReferenceNumber?.split(".")?.includes("I") ||
              inventoryValue.gpcReferenceNumber?.split(".").includes("II");
            let efUnit = null;

            if (usesEf) {
              let scope = inventoryValue.gpcReferenceNumber?.split(".")[2];
              efUnit = scope === "1" ? "kg/m3" : "kg/TJ";
            }

            return {
              emission_factor_unit: efUnit,
              emission_co2,
              emission_ch4,
              emission_n2o,
              activity_amount: activityAmount,
              activity_unit: activityUnit,
              data_source_id: "",
              data_source_name: dataSource,
              total_co2e: toDecimal(activityValue.co2eq as bigint)
                ?.div(new Decimal("1e3"))
                .toNumber(),
            };
          }),
        };
      }

      if (dataDictionary[gpcRefNo as string].notation_key) {
        dataDictionary[gpcRefNo as string].activityValues = [{}];
      }
    });
    return dataDictionary;
  }
}
