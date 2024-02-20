import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import { NextResponse } from "next/server";

import type { Inventory } from "@/models/Inventory";
import type { InventoryValue } from "@/models/InventoryValue";

export const GET = apiHandler(async (req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
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

async function inventoryXLS(inventory: Inventory): Promise<Buffer> {
  return Buffer.from("Not implemented");
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
