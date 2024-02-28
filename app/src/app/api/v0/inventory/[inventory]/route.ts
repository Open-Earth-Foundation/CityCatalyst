import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import Excel from "exceljs";

import type { Inventory } from "@/models/Inventory";
import type { InventoryValue } from "@/models/InventoryValue";
import createHttpError from "http-errors";
import { db } from "@/models";
import { groupBy } from "@/util/helpers";

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
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
    [
      {
        model: db.models.InventoryValue,
        as: "inventoryValues",
        include: [
          {
            model: db.models.GasValue,
            as: "gasValues",
            include: [
              { model: db.models.EmissionsFactor, as: "emissionsFactor" },
            ],
          },
          {
            model: db.models.DataSource,
            attributes: ["datasourceId", "sourceType"],
            as: "dataSource",
          },
        ],
      },
    ],
  );

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
    case "json":
    default:
      body = Buffer.from(JSON.stringify({ data: inventory.toJSON() }), "utf-8");
      headers = {
        "Content-Type": "application/json",
      };
      break;
  }

  return new NextResponse(body, { headers });
});

async function inventoryCSV(inventory: Inventory): Promise<Buffer> {
  // TODO better export without UUIDs and merging in data source props, gas values, emission factors
  const inventoryValues = await inventory.getInventoryValues();
  const headers = [
    "Inventory Reference",
    "GPC Reference Number",
    "Total Emissions",
    "Activity Units",
    "Activity Value",
    "Emission Factor Value",
    "Datasource ID",
  ].join(",");
  const inventoryLines = inventoryValues.map((value: InventoryValue) => {
    return [
      value.subCategoryId,
      value.gpcReferenceNumber,
      value.co2eq,
      value.activityUnits,
      value.activityValue,
      // value.emissionsFactor,
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
  workbook = await workbook.xlsx.readFile(CIRIS_TEMPLATE_PATH); // TODO load once and keep in memory?
  workbook.eachSheet((sheet, i) => console.log(sheet.name, i));

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
      const refNoColumn = sheet.getColumn("B");
      const rowIndex = refNoColumn.values.findIndex(
        (sheetValue) => sheetValue === inventoryValue.gpcReferenceNumber,
      );
      if (rowIndex === -1) {
        throw new createHttpError.BadRequest(
          `Row for ref no ${inventoryValue.gpcReferenceNumber} not found`,
        );
      }
      // + 2 because it's one based and we want one below the summary row
      const row = sheet.getRow(rowIndex + 2);
      if (!row) {
        throw createHttpError.BadRequest(
          `Couldn't find row ${rowIndex + 2} on sheet ${sheetIndex}`,
        );
      }

      console.log(
        "InventoryValue",
        inventoryValue.id,
        inventoryValue.gpcReferenceNumber,
        rowIndex,
        sheetIndex,
      );

      if (inventoryValue.unavailableReason) {
        row.getCell("M").value =
          notationKeyMapping[inventoryValue.unavailableReason];
        row.getCell("AM").value = inventoryValue.unavailableExplanation;
      } else {
        row.getCell("AM").value = inventoryValue.dataSource?.notes;
      }

      row.getCell("N").value = inventoryValue.activityValue;
      row.getCell("O").value = inventoryValue.activityUnits;
      row.getCell("S").value = "CO2, CH4, N2O"; // gases for emissions factor

      // TODO add emissions factor to Emissions factors sheet (ID 19)
      const groupedGases = groupBy(
        inventoryValue.gasValues,
        (value) => value.gas!,
      );
      row.getCell("V").value =
        groupedGases.CO2[0].emissionsFactor?.emissionsPerActivity;
      row.getCell("W").value =
        groupedGases.CH4[0].emissionsFactor?.emissionsPerActivity;
      row.getCell("X").value =
        groupedGases.N2O[0].emissionsFactor?.emissionsPerActivity;
      row.getCell("Y").value = converKgToTons(inventoryValue.co2eq);

      if (
        inventoryValue.gasValues.some((gasValue) => gasValue.gasAmount != null)
      ) {
        row.getCell("AA").value = "✓";
        row.getCell("AB").value = converKgToTons(groupedGases.CO2[0].gasAmount);
        row.getCell("AJ").value = converKgToTons(groupedGases.CO2[0].gasAmount);

        row.getCell("AC").value = converKgToTons(groupedGases.CH4[0].gasAmount);
        row.getCell("AH").value = converKgToTons(groupedGases.CH4[0].gasAmount);

        row.getCell("AD").value = converKgToTons(groupedGases.N2O[0].gasAmount);
        row.getCell("AI").value = converKgToTons(groupedGases.N2O[0].gasAmount);

        row.getCell("AE").value = converKgToTons(inventoryValue.co2eq);
        row.getCell("AJ").value = converKgToTons(inventoryValue.co2eq);
        // CO2(b) is biogeneric CO2 - CO2 not from burning fossil fuel
        // applies to columns Z, AF, AK
      }

      row.getCell("AJ").value = converKgToTons(inventoryValue.co2eq);
      row.getCell("AL").value = inventoryValue.dataSource.dataQuality
        ?.slice(0, 1)
        .toUpperCase();
      row.getCell("AN").value = inventoryValue.dataSource.name; // TODO add source to Data sources sheet (ID 20)

      row.commit();
    }
  }

  // await workbook.xlsx.writeFile("test.xlsx");
  return Buffer.from(await workbook.xlsx.writeBuffer());
  // return Buffer.from("Not implemented");
}

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );
  await inventory.destroy();
  return NextResponse.json({ data: inventory, deleted: true });
});

export const PATCH = apiHandler(async (req, context) => {
  const { params, session } = context;
  const body = createInventoryRequest.parse(await req.json());

  let inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );
  inventory = await inventory.update(body);
  return NextResponse.json({ data: inventory });
});
