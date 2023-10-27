import { db } from "@/models";
import { SubCategoryValue } from "@/models/SubCategoryValue";
import { SubSectorValue } from "@/models/SubSectorValue";
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
          where: {
            userId: session?.user.id,
          },
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
  const subSectorValues: SubSectorValue[] =
    await inventory.getSubSectorValues();
  const subCategoryValues: SubCategoryValue[] =
    await inventory.getSubCategoryValues();
  const headers = [
    "Inventory Reference",
    "Total Emissions",
    "Activity Units",
    "Activity Value",
    "Emission Factor Value",
    "Datasource ID",
  ].join(",");
  const subSectorLines = subSectorValues.map((value: SubSectorValue) => {
    return [
      value.subsectorId,
      value.totalEmissions,
      value.activityUnits,
      value.activityValue,
      value.emissionFactorValue,
      value.datasourceId,
    ].join(",");
  });
  const subCategoryLines = subCategoryValues.map((value: SubCategoryValue) => {
    return [
      value.subcategoryId,
      value.totalEmissions,
      value.activityUnits,
      value.activityValue,
      value.emissionFactorValue,
      value.datasourceId,
    ].join(",");
  });
  return Buffer.from(
    [headers, ...subSectorLines, ...subCategoryLines].join("\n"),
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
          where: {
            userId: session?.user.id,
          },
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
          where: {
            userId: session?.user.id,
          },
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
