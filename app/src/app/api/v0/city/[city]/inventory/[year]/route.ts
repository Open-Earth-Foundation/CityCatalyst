import { db } from "@/models";
import { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;
    const city = await db.models.City.findOne({
      where: { locode: params.city },
      include: [
        {
          model: db.models.User,
          as: "users",
          // where: {
          //   userId: session?.user.id,
          // },
        },
      ],
    });
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    if (!city) {
      throw new createHttpError.NotFound("User is not part of this city");
    }

    const inventory = await db.models.Inventory.findOne({
      where: { cityId: city.cityId, year: params.year },
      include: [{ model: db.models.City, as: "city" }],
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

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
        body = Buffer.from(
          JSON.stringify({ data: inventory.toJSON() }),
          "utf-8",
        );
        headers = {
          "Content-Type": "application/json",
        };
        break;
    }

    return new NextResponse(body, { headers });
  },
);

async function inventoryCSV(inventory: any): Promise<Buffer> {
  // TODO better export without UUIDs and merging in data source props, gas values, emission factors
  const inventoryValues: InventoryValue[] = await inventory.getInventoryValues();
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
  return Buffer.from(
    [headers, ...inventoryLines].join("\n"),
  );
}

async function inventoryXLS(inventory: any): Promise<Buffer> {
  return Buffer.from("Not implemented");
}

export const DELETE = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;
    const city = await db.models.City.findOne({
      where: { locode: params.city },
      include: [
        {
          model: db.models.User,
          as: "users",
          // where: {
          //   userId: session?.user.id,
          // },
        },
      ],
    });
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    if (!city) {
      throw new createHttpError.NotFound("User is not part of this city");
    }

    const inventory = await db.models.Inventory.findOne({
      where: { cityId: city.cityId, year: params.year },
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    await inventory.destroy();
    return NextResponse.json({ data: inventory, deleted: true });
  },
);

export const PATCH = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;
    const body = createInventoryRequest.parse(await req.json());

    let city = await db.models.City.findOne({
      where: { locode: params.city },
      include: [
        {
          model: db.models.User,
          as: "users",
          // where: {
          //   userId: session?.user.id,
          // },
        },
      ],
    });

    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    if (!city) {
      throw new createHttpError.NotFound("User is not part of this city");
    }

    let inventory = await db.models.Inventory.findOne({
      where: { cityId: city.cityId, year: params.year },
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }
    inventory = await inventory.update(body);
    return NextResponse.json({ data: inventory });
  },
);
