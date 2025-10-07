/**
 * @swagger
 * /api/v0/inventory/{inventory}/download:
 *   get:
 *     tags:
 *       - Inventory Download
 *     summary: Download inventory data
 *     description: Downloads inventory data in various formats. If `format` is omitted or `json`, returns JSON. Other formats stream binary.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: format
 *         required: false
 *         schema:
 *           type: string
 *           enum: [json, csv, xls, ecrf]
 *       - in: query
 *         name: lng
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inventory data content.
 */
import { apiHandler } from "@/util/api";
import Excel from "exceljs";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import CSVDownloadService from "@/backend/CSVDownloadService";
import ECRFDownloadService from "@/backend/ECRFDownloadService";
import InventoryDownloadService from "@/backend/InventoryDownloadService";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { getTranslationFromDictionary, keyBy } from "@/util/helpers";
import type {
  InventoryDownloadResponse,
  InventoryWithInventoryValuesAndActivityValues,
} from "@/util/types";

const CIRIS_TEMPLATE_PATH = "./templates/CIRIS_template.xlsm";

const notationKeyMapping: { [key: string]: string } = {
  "no-occurrance": "NO",
  "not-estimated": "NE",
  "confidential-information": "C",
  "included-elsewhere": "IE",
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

  let body: Buffer | null = null;
  let headers: Record<string, string> | null = null;

  const { output, inventory } =
    await InventoryDownloadService.queryInventoryData(
      params.inventory,
      session,
    );

  switch (req.nextUrl.searchParams.get("format")?.toLowerCase()) {
    case "csv":
      const { headerTitles, inventoryLines } =
        await CSVDownloadService.extractCSVData(
          output as InventoryWithInventoryValuesAndActivityValues,
          lng,
        );
      body = CSVDownloadService.stringifyCSV(headerTitles, inventoryLines);
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

  return new NextResponse(body ? new Uint8Array(body) : undefined, { headers });
});

function converKgToTons(amount: bigint | null | undefined): string {
  if (amount == null) {
    return "";
  }
  return (BigInt(amount) / 1000n).toString(); // TODO do we need floating point values?
}

async function inventoryXLS(
  inventory: InventoryDownloadResponse,
): Promise<Buffer> {
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
  logger.debug({ time: Date.now() }, "load_ciris");
  workbook = await workbook.xlsx.readFile(CIRIS_TEMPLATE_PATH); // TODO load once and keep in memory?
  logger.debug({ timeEnd: Date.now() }, "load_ciris");

  logger.debug({ time: Date.now() }, "edit_ciris");
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
  logger.debug({ timeEnd: Date.now() }, "edit_ciris");

  // await workbook.xlsx.writeFile("test.xlsx");
  logger.debug({ time: Date.now() }, "save_ciris");
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  logger.debug({ timeEnd: Date.now() }, "save_ciris");
  return buffer;
  // return Buffer.from("Not implemented");
}
