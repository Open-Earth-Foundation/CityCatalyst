import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubSectorRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const subsectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorId: params.subsector, inventoryId: params.inventory },
    include: [
      {
        model: db.models.SubCategoryValue,
        as: "subCategoryValues",
        include: [
          {
            model: db.models.DataSource,
            as: "dataSource",
          },
        ],
      },
    ],
  });
  if (!subsectorValue) {
    throw new createHttpError.NotFound("Sub sector value not found");
  }
  return NextResponse.json({ data: subsectorValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubSectorRequest.parse(await req.json());
  let subSectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorId: params.subsector, inventoryId: params.inventory },
    include: [{ model: db.models.DataSource, as: "dataSource" }],
  });

  const sourceData = {
    ...body.dataSource,
    sourceType: "user",
    datasourceId: randomUUID(),
  };

  if (subSectorValue) {
    let datasourceId: string | undefined = undefined;
    if (subSectorValue.datasourceId) {
      if (subSectorValue.dataSource.sourceType === "user") {
        if (body.dataSource) {
          await subSectorValue.dataSource.update(body.dataSource);
        }
        datasourceId = subSectorValue.datasourceId;
      } else {
        const source = await db.models.DataSource.create(sourceData);
        datasourceId = source.datasourceId;
      }
    } else {
      const source = await db.models.DataSource.create(sourceData);
      datasourceId = source.datasourceId;
    }
    subSectorValue = await subSectorValue.update({ ...body, datasourceId });
  } else {
    const subSector = await db.models.SubSector.findOne({
      where: { subsectorId: params.subsector },
    });
    if (!subSector) {
      throw new createHttpError.InternalServerError(
        "No subsector found for id " + params.subsector,
      );
    }
    let sectorValue = await db.models.SectorValue.findOne({
      where: { sectorId: subSector.sectorId },
    });
    if (!sectorValue) {
      sectorValue = await db.models.SectorValue.create({
        sectorValueId: randomUUID(),
        sectorId: subSector.sectorId,
        inventoryId: params.inventory,
      });
    }
    const dataSource = await db.models.DataSource.create(sourceData);
    subSectorValue = await db.models.SubSectorValue.create({
      subsectorValueId: randomUUID(),
      subsectorId: subSector.subsectorId,
      inventoryId: params.inventory,
      sectorValueId: sectorValue.sectorValueId,
      datasourceId: dataSource.datasourceId,
      ...body,
    });
  }

  return NextResponse.json({ data: subSectorValue });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }) => {
  const subsectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorId: params.subsector, inventoryId: params.inventory },
  });
  if (!subsectorValue) {
    throw new createHttpError.NotFound("Sub sector value  not found");
  }

  await subsectorValue.destroy();

  return NextResponse.json({ data: subsectorValue, deleted: true });
});
