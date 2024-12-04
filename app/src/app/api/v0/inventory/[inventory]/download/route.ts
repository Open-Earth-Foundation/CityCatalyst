import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import Excel from "exceljs";
import { Op } from "sequelize";
import createHttpError from "http-errors";

import type { Inventory } from "@/models/Inventory";
import type { InventoryValue } from "@/models/InventoryValue";
import type { InventoryResponse } from "@/util/types";
import type { EmissionsFactor } from "@/models/EmissionsFactor";
import { db } from "@/models";
import {
  findClosestYearToInventory,
  getTranslationFromDictionary,
  keyBy,
  PopulationEntry,
} from "@/util/helpers";
import ECRFDownloadService, {
  InventoryWithInventoryValuesAndActivityValues,
} from "@/backend/ECRFDownloadService";

type InventoryValueWithEF = InventoryValue & {
  emissionsFactor?: EmissionsFactor;
};

const CIRIS_TEMPLATE_PATH = "./templates/CIRIS_template.xlsm";

const notationKeyMapping: { [key: string]: string } = {
  "no-occurrance": "NO",
  "not-estimated": "NE",
  "confidential-information": "C",
  "presented-elsewhere": "IE",
};

// converts sector GPC reference number to index of sheet in CIRIS file
const sectorSheetMapping: { [key: string]: number } = {
  I: 106,
  II: 11,
  III: 107,
  IV: 6,
  V: 10,
  VI: 13,
};

export const GET = apiHandler(async (req, { params, session }) => {
  const lng = req.nextUrl.searchParams.get("lng") || "en";
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
    [
      {
        model: db.models.InventoryValue,
        as: "inventoryValues",
        include: [
          {
            model: db.models.ActivityValue,
            as: "activityValues",
            include: [
              {
                model: db.models.GasValue,
                as: "gasValues",
                separate: true,
                include: [
                  {
                    model: db.models.EmissionsFactor,
                    as: "emissionsFactor",
                  },
                ],
              },
            ],
          },
          {
            model: db.models.DataSource,
            attributes: [
              "datasourceId",
              "sourceType",
              "datasetName",
              "datasourceName",
              "dataQuality",
            ],
            as: "dataSource",
          },
        ],
      },
    ],
  );

  if (!inventory.year) {
    throw new createHttpError.BadRequest(
      `Inventory ${inventory.inventoryId} is missing a year number`,
    );
  }
  const MAX_YEARS_DIFFERENCE = 10;
  const populationEntries = await db.models.Population.findAll({
    attributes: ["year", "population"],
    where: {
      cityId: inventory.cityId,
      year: {
        [Op.gte]: inventory.year - MAX_YEARS_DIFFERENCE,
        [Op.lte]: inventory.year + MAX_YEARS_DIFFERENCE,
      },
      population: {
        [Op.ne]: null,
      },
    },
    order: [["year", "DESC"]],
  });

  const population = findClosestYearToInventory(
    populationEntries as PopulationEntry[],
    inventory.year,
    MAX_YEARS_DIFFERENCE,
  );
  if (!population) {
    throw new createHttpError.NotFound(
      `Population data not found for city ${inventory.cityId} for year ${inventory.year}`,
    );
  }

  const output: InventoryResponse = inventory.toJSON();
  output.city.populationYear = population.year;
  output.city.population = population.population || 0;
  let body: Buffer | null = null;
  let headers: Record<string, string> | null = null;

  switch (req.nextUrl.searchParams.get("format")?.toLowerCase()) {
    case "csv":
      body = await inventoryCSV(inventory);
      headers = {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="inventory-${inventory.city.locode}-${inventory.year}.csv"`,
      };
      break;
    case "xls":
      body = await inventoryXLS(inventory);
      headers = {
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": `attachment; filename="inventory-${inventory.city.locode}-${inventory.year}.xls"`,
      };
      break;
    case "ecrf":
      body = await ECRFDownloadService.downloadECRF(
        output as InventoryWithInventoryValuesAndActivityValues,
        lng,
      );
      headers = {
        "Content-Type": "application/vnd.ms-excel",
        "Content-Disposition": `attachment; filename="eCRF-inventory-${inventory.city.locode}-${inventory.year}.xlsx"`,
      };
      break;
    case "json":
    default:
      body = Buffer.from(JSON.stringify({ data: output }), "utf-8");
      headers = {
        "Content-Type": "application/json",
      };
      break;
  }

  return new NextResponse(body, { headers });
});

async function inventoryCSV(inventory: Inventory): Promise<Buffer> {
  // TODO better export without UUIDs and merging in data source props, gas values, emission factors
  const inventoryValues = await db.models.InventoryValue.findAll({
    where: {
      inventoryId: inventory.inventoryId,
    },
  });
  const headers = [
    "Inventory Reference",
    "GPC Reference Number",
    "Total Emissions",
    "Activity Units",
    "Activity Value",
    "Emission Factor Value",
    "Datasource ID",
  ].join(",");
  const inventoryLines = inventoryValues.map((value: InventoryValueWithEF) => {
    return [
      value.subCategoryId,
      value.gpcReferenceNumber,
      value.co2eq,
      value.activityUnits,
      value.activityValue,
      value.emissionsFactor?.emissionsPerActivity ?? "N/A",
      value.datasourceId,
    ].join(",");
  });
  return Buffer.from([headers, ...inventoryLines].join("\n"));
}

function converKgToTons(amount: bigint | null | undefined): string {
  if (amount == null) {
    return "";
  }
  return (BigInt(amount) / 1000n).toString(); // TODO do we need floating point values?
}

async function inventoryXLS(inventory: Inventory): Promise<Buffer> {
  const sectors = await db.models.Sector.findAll();
  const inventorySectors = sectors
    .map((sector) => {
      return {
        sector,
        values: inventory.inventoryValues.filter(
          (value) => value.sectorId === sector.sectorId,
        ),
      };
    })
    .filter(({ values }) => values.length > 0);

  let workbook = new Excel.Workbook();
  console.time("load_ciris");
  workbook = await workbook.xlsx.readFile(CIRIS_TEMPLATE_PATH); // TODO load once and keep in memory?
  console.timeEnd("load_ciris");
  // workbook.eachSheet((sheet, i) => console.log(sheet.name, i));

  console.time("edit_ciris");
  for (const { sector, values } of inventorySectors) {
    if (!sector.referenceNumber) {
      throw new createHttpError.BadRequest(
        `Sector ${sector.sectorId} is missing a reference number!`,
      );
    }
    const sheetIndex = sectorSheetMapping[sector.referenceNumber];
    if (sheetIndex == null) {
      throw new createHttpError.BadRequest(
        `Sheet index mapping missing for sector ${sector.referenceNumber}`,
      );
    }

    const sheet = workbook.getWorksheet(sheetIndex);
    if (!sheet) {
      throw new createHttpError.BadRequest(
        `Sheet missing for sector ${sector.referenceNumber}`,
      );
    }

    for (const inventoryValue of values) {
      if (!inventoryValue.gpcReferenceNumber) {
        throw new createHttpError.BadRequest(
          `GPC reference number missing for inventory value ${inventoryValue.id}`,
        );
      }
      const refNoColumn = sheet.getColumn("B");
      const rowIndex = refNoColumn.values.findIndex(
        (sheetValue) => sheetValue === inventoryValue.gpcReferenceNumber,
      );
      if (rowIndex === -1) {
        throw new createHttpError.BadRequest(
          `Row for ref no ${inventoryValue.gpcReferenceNumber} not found`,
        );
      }
      // + 1 because it's one based and we want one below the summary row
      // TODO start storing multiple rows for each activity/ fuel type etc.
      const row = sheet.getRow(rowIndex + 1);
      if (!row) {
        throw createHttpError.BadRequest(
          `Couldn't find row ${rowIndex + 1} on sheet ${sheetIndex}`,
        );
      }

      if (inventoryValue.unavailableReason) {
        row.getCell("AM").value =
          notationKeyMapping[inventoryValue.unavailableReason];
        row.getCell("AQ").value = inventoryValue.unavailableExplanation;
      } else {
        row.getCell("AO").value = inventoryValue.dataSource?.notes;
      }

      // TODO get these as separate values from emissions factor seeder
      const activityUnit = inventoryValue.activityUnits?.split("/")[0];
      const emissionsFactorUnit = inventoryValue.activityUnits
        ?.split(" ")[0]
        .split("/")[1];
      const activityType = inventoryValue.activityUnits?.split(" ")[1];

      row.getCell("G").value = activityType;
      row.getCell("N").value = inventoryValue.activityValue;
      row.getCell("O").value = activityUnit;
      row.getCell("P").value = emissionsFactorUnit;
      row.getCell("S").value = "CO2, CH4, N2O"; // gases for emissions factor

      // TODO add emissions factor to Emissions factors sheet (ID 19)
      const groupedGases = keyBy(
        inventoryValue.gasValues,
        (value) => value.gas!,
      );
      row.getCell("V").value =
        groupedGases.CO2?.emissionsFactor?.emissionsPerActivity;
      row.getCell("W").value =
        groupedGases.CH4?.emissionsFactor?.emissionsPerActivity;
      row.getCell("X").value =
        groupedGases.N2O?.emissionsFactor?.emissionsPerActivity;
      // TODO is this correct? Or what's the tCO2e of an emissions factor?
      row.getCell("Y").value = converKgToTons(inventoryValue.co2eq);

      if (
        inventoryValue.gasValues.some((gasValue) => gasValue.gasAmount != null)
      ) {
        row.getCell("AC").value = "✓";
        row.getCell("AD").value = converKgToTons(groupedGases.CO2?.gasAmount);
        // row.getCell("AI").value = converKgToTons(groupedGases.CO2?.gasAmount);

        row.getCell("AE").value = converKgToTons(groupedGases.CH4?.gasAmount);
        // row.getCell("AJ").value = converKgToTons(groupedGases.CH4?.gasAmount);

        row.getCell("AF").value = converKgToTons(groupedGases.N2O?.gasAmount);
        // row.getCell("AK").value = converKgToTons(groupedGases.N2O?.gasAmount);

        row.getCell("AG").value = converKgToTons(inventoryValue.co2eq);
        // row.getCell("AL").value = converKgToTons(inventoryValue.co2eq);
        // CO2(b) is biogeneric CO2 - CO2 not from burning fossil fuel
        // applies to columns Z, AF, AK
      } else {
        // TODO calculate total gas amounts from activity
      }

      // TODO calculate
      // row.getCell("AL").value = converKgToTons(inventoryValue.co2eq);
      row.getCell("AD").value = inventoryValue.dataSource?.dataQuality
        ?.slice(0, 1)
        .toUpperCase();
      row.getCell("AP").value = getTranslationFromDictionary(
        inventoryValue.dataSource?.datasetName,
      ); // TODO add source to Data sources sheet (ID 20)

      row.commit();
    }
  }
  console.timeEnd("edit_ciris");

  // await workbook.xlsx.writeFile("test.xlsx");
  console.time("save_ciris");
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  console.timeEnd("save_ciris");
  return buffer;
  // return Buffer.from("Not implemented");
}
