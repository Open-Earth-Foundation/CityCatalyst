import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createUserFileRequset } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// TODO: use these variables to configure file size and format
const MAX_FILE_SIZE = 5000000;
const ACCEPTED_FILE_FORMATS = []; // file formats types to be parsed and refined later

export const GET = apiHandler(
  async (
    _req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const userId = context.session?.user.id;
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const userFiles = await db.models.UserFile.findAll({
      where: {
        userId: userId,
      },
    });

    if (!userFiles) {
      throw new createHttpError.NotFound("User files not found");
    }

    return NextResponse.json({ data: userFiles });
  },
);

export const POST = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const userId = context.session?.user.id;

    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const formData = await req.formData();
    const file = formData?.get("data") as unknown as File;

    if (!file)
      throw new createHttpError.BadRequest("File not found, Please add a file");

    const filename = file.name;

    const fileType = file.name.slice(
      ((filename.lastIndexOf(".") - 1) >>> 0) + 2,
    );

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileData = {
      userId: userId,
      fileReference: formData.get("fileReference"),
      url: formData.get("url"),
      data: buffer,
      fileType: fileType,
      sector: formData.get("sector"),
      status: formData.get("status"),
      gpcRefNo: formData.get("gpcRefNo"),
    };

    const body = createUserFileRequset.parse(fileData);

    const userFile = await db.models.UserFile.create({
      id: randomUUID(),
      ...body,
    });

    if (!userFile) {
      throw new createHttpError.NotFound("User files not found");
    }

    return NextResponse.json({
      data: {
        id: userFile.id,
        userId: userFile.id,
        fileReference: userFile.fileReference,
        url: userFile.url,
        sector: userFile.sector,
        status: userFile.status,
        gpcRefNo: userFile.gpcRefNo,
        file: {
          fileName: file.name,
          size: file.size,
          fileType: userFile.fileType,
        },
      },
    });
  },
);
